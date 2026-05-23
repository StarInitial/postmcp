package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (a *App) ExecuteHTTP(req HttpRequest) (*HttpResponse, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	settings, err := a.loadAppSettings()
	if err != nil {
		return nil, err
	}
	req = applyHTTPSettings(req, settings)

	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), normalizedTimeout(req.TimeoutMs))
	defer cancel()

	resolvedURL, err := buildURL(req.URL, req.Query, req.Auth, req.DisabledAutoFields)
	if err != nil {
		return nil, err
	}

	bodyReader, contentType, err := buildRequestBody(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, strings.ToUpper(strings.TrimSpace(req.Method)), resolvedURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	applyHTTPVersion(httpReq, settings.HTTPVersion)

	for _, header := range enabledPairs(req.Headers) {
		httpReq.Header.Set(header.Key, header.Value)
	}
	if settings.NoCacheHeader {
		if httpReq.Header.Get("Cache-Control") == "" {
			httpReq.Header.Set("Cache-Control", "no-cache")
		}
		if httpReq.Header.Get("Pragma") == "" {
			httpReq.Header.Set("Pragma", "no-cache")
		}
	}
	applyHTTPCookies(httpReq, resolvedURL, req.CookieScopes)
	if contentType != "" && httpReq.Header.Get("Content-Type") == "" && isAutoFieldEnabled(req.DisabledAutoFields, "header:content-type") {
		httpReq.Header.Set("Content-Type", contentType)
	}
	applyHTTPAuth(httpReq, req.Auth, req.DisabledAutoFields)

	client := buildHTTPClient(settings, normalizedTimeout(req.TimeoutMs))
	resp, err := client.Do(httpReq)
	if err != nil {
		result := &HttpResponse{
			Error:       err.Error(),
			DurationMs:  time.Since(start).Milliseconds(),
			RequestedAt: start.Format(time.RFC3339),
			ResolvedURL: resolvedURL,
		}
		a.appendHistory(ModeHTTP, HistoryItem{
			ID:          uuid.NewString(),
			Mode:        ModeHTTP,
			Title:       req.Method + " " + resolvedURL,
			Subtitle:    err.Error(),
			Status:      "error",
			DurationMs:  result.DurationMs,
			Timestamp:   start.Format(time.RFC3339),
			SummaryJSON: summarizeJSON(map[string]any{"request": req, "response": result}),
		})
		return result, nil
	}
	defer resp.Body.Close()

	body, truncated, readErr := readHTTPResponseBody(resp.Body, settings.MaxResponseSize)
	if readErr != nil {
		return nil, fmt.Errorf("read response: %w", readErr)
	}

	result := &HttpResponse{
		StatusCode:  resp.StatusCode,
		StatusText:  resp.Status,
		DurationMs:  time.Since(start).Milliseconds(),
		SizeBytes:   len(body),
		Headers:     flattenHeaders(resp.Header),
		Body:        string(body),
		ContentType: resp.Header.Get("Content-Type"),
		RequestedAt: start.Format(time.RFC3339),
		ResolvedURL: resp.Request.URL.String(),
	}
	if truncated {
		result.Error = fmt.Sprintf("响应体超过配置上限 %d MB，已截断。", normalizeMaxResponseSize(settings.MaxResponseSize)/(1024*1024))
	}

	status := fmt.Sprintf("%d", resp.StatusCode)
	a.appendHistory(ModeHTTP, HistoryItem{
		ID:          uuid.NewString(),
		Mode:        ModeHTTP,
		Title:       strings.ToUpper(req.Method) + " " + resolvedURL,
		Subtitle:    resp.Status,
		Status:      status,
		DurationMs:  result.DurationMs,
		Timestamp:   start.Format(time.RFC3339),
		SummaryJSON: summarizeJSON(map[string]any{"request": req, "response": result}),
	})

	return result, nil
}

func buildURL(rawURL string, query []KeyValuePair, auth HttpAuth, disabledAutoFields []string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return "", fmt.Errorf("parse url: %w", err)
	}
	values := parsed.Query()
	if strings.EqualFold(strings.TrimSpace(auth.Type), "apikey") && strings.EqualFold(strings.TrimSpace(auth.APIKeyIn), "query") {
		key := strings.TrimSpace(auth.APIKeyKey)
		value := strings.TrimSpace(auth.APIKeyValue)
		if key != "" && value != "" && isAutoFieldEnabled(disabledAutoFields, "query:"+normalizeAutoFieldKey(key)) {
			values.Set(key, value)
		}
	}
	for _, item := range enabledPairs(query) {
		values.Set(item.Key, item.Value)
	}
	parsed.RawQuery = values.Encode()
	return parsed.String(), nil
}

func buildRequestBody(req HttpRequest) (io.Reader, string, error) {
	switch req.Body.Mode {
	case "", "none":
		return nil, "", nil
	case "json", "raw":
		contentType := req.Body.ContentType
		if contentType == "" {
			contentType = "application/json"
		}
		return bytes.NewBufferString(req.Body.Raw), contentType, nil
	case "x-www-form-urlencoded":
		values := url.Values{}
		for _, pair := range enabledPairs(req.Body.URLEncoded) {
			values.Set(pair.Key, pair.Value)
		}
		return strings.NewReader(values.Encode()), "application/x-www-form-urlencoded", nil
	case "form-data":
		var buffer bytes.Buffer
		writer := multipart.NewWriter(&buffer)
		for _, pair := range enabledFormDataPairs(req.Body.FormData) {
			if pair.ValueType == "file" {
				fileName := pair.FileName
				if fileName == "" {
					fileName = filepath.Base(pair.FilePath)
				}
				if fileName == "" {
					fileName = "upload.bin"
				}

				part, err := writer.CreateFormFile(pair.Key, fileName)
				if err != nil {
					return nil, "", fmt.Errorf("create form file: %w", err)
				}

				switch {
				case strings.TrimSpace(pair.FilePath) != "":
					data, err := os.ReadFile(filepath.Clean(pair.FilePath))
					if err != nil {
						return nil, "", fmt.Errorf("read form file: %w", err)
					}
					if _, err := part.Write(data); err != nil {
						return nil, "", fmt.Errorf("write form file: %w", err)
					}
				case strings.TrimSpace(pair.FileBase64) != "":
					data, err := base64.StdEncoding.DecodeString(pair.FileBase64)
					if err != nil {
						return nil, "", fmt.Errorf("decode form file: %w", err)
					}
					if _, err := part.Write(data); err != nil {
						return nil, "", fmt.Errorf("write form file: %w", err)
					}
				}
				continue
			}

			if err := writer.WriteField(pair.Key, pair.Value); err != nil {
				return nil, "", fmt.Errorf("write form field: %w", err)
			}
		}
		if err := writer.Close(); err != nil {
			return nil, "", fmt.Errorf("close form writer: %w", err)
		}
		return &buffer, writer.FormDataContentType(), nil
	case "binary":
		if req.Body.BinaryFile == "" && req.Body.BinaryBase64 == "" {
			return nil, "", nil
		}
		var data []byte
		if strings.TrimSpace(req.Body.BinaryFile) != "" {
			fileData, err := os.ReadFile(filepath.Clean(req.Body.BinaryFile))
			if err != nil {
				return nil, "", fmt.Errorf("read binary file: %w", err)
			}
			data = fileData
		} else {
			decoded, err := base64.StdEncoding.DecodeString(req.Body.BinaryBase64)
			if err != nil {
				return nil, "", fmt.Errorf("decode binary body: %w", err)
			}
			data = decoded
		}
		return bytes.NewReader(data), req.Body.ContentType, nil
	default:
		return bytes.NewBufferString(req.Body.Raw), req.Body.ContentType, nil
	}
}

func enabledFormDataPairs(items []HttpFormDataItem) []HttpFormDataItem {
	result := make([]HttpFormDataItem, 0, len(items))
	for _, item := range items {
		if !item.Enabled || strings.TrimSpace(item.Key) == "" {
			continue
		}
		result = append(result, item)
	}
	return result
}

func applyHTTPAuth(req *http.Request, auth HttpAuth, disabledAutoFields []string) {
	switch strings.ToLower(strings.TrimSpace(auth.Type)) {
	case "basic":
		username := strings.TrimSpace(auth.Username)
		password := strings.TrimSpace(auth.Password)
		if username == "" || password == "" {
			return
		}
		if !isAutoFieldEnabled(disabledAutoFields, "header:authorization") {
			return
		}
		creds := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
		req.Header.Set("Authorization", "Basic "+creds)
	case "bearer":
		token := strings.TrimSpace(auth.Token)
		if token == "" {
			return
		}
		if !isAutoFieldEnabled(disabledAutoFields, "header:authorization") {
			return
		}
		req.Header.Set("Authorization", "Bearer "+token)
	case "apikey":
		if !strings.EqualFold(strings.TrimSpace(auth.APIKeyIn), "header") {
			return
		}
		key := strings.TrimSpace(auth.APIKeyKey)
		value := strings.TrimSpace(auth.APIKeyValue)
		if key == "" || value == "" || !isAutoFieldEnabled(disabledAutoFields, "header:"+normalizeAutoFieldKey(key)) {
			return
		}
		req.Header.Set(key, value)
	}
}

func normalizeAutoFieldKey(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func isAutoFieldEnabled(disabledAutoFields []string, fieldID string) bool {
	if fieldID == "" {
		return true
	}
	normalizedID := normalizeAutoFieldKey(fieldID)
	for _, item := range disabledAutoFields {
		if normalizeAutoFieldKey(item) == normalizedID {
			return false
		}
	}
	return true
}

func applyHTTPCookies(req *http.Request, resolvedURL string, scopes []HttpCookieScope) {
	requestHost := strings.ToLower(strings.TrimSpace(req.URL.Hostname()))
	if requestHost == "" {
		if parsed, err := url.Parse(strings.TrimSpace(resolvedURL)); err == nil {
			requestHost = strings.ToLower(strings.TrimSpace(parsed.Hostname()))
		}
	}
	if requestHost == "" {
		return
	}

	cookieParts := make([]string, 0)
	for _, scope := range scopes {
		if !cookieHostMatches(scope.Host, requestHost) {
			continue
		}
		for _, cookie := range scope.Cookies {
			if !cookie.Enabled {
				continue
			}
			name := strings.TrimSpace(cookie.Name)
			if name == "" {
				continue
			}
			cookieParts = append(cookieParts, name+"="+cookie.Value)
		}
	}

	if len(cookieParts) == 0 {
		return
	}

	managedCookie := strings.Join(cookieParts, "; ")
	existing := strings.TrimSpace(req.Header.Get("Cookie"))
	if existing == "" {
		req.Header.Set("Cookie", managedCookie)
		return
	}
	req.Header.Set("Cookie", existing+"; "+managedCookie)
}

func cookieHostMatches(scopeHost string, requestHost string) bool {
	normalizedScope := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(scopeHost)), ".")
	if normalizedScope == "" || requestHost == "" {
		return false
	}
	return requestHost == normalizedScope || strings.HasSuffix(requestHost, "."+normalizedScope)
}

func flattenHeaders(headers http.Header) []KeyValuePair {
	out := make([]KeyValuePair, 0, len(headers))
	for key, values := range headers {
		out = append(out, KeyValuePair{ID: uuid.NewString(), Key: key, Value: strings.Join(values, ", "), Enabled: true})
	}
	return out
}

func enabledPairs(items []KeyValuePair) []KeyValuePair {
	result := make([]KeyValuePair, 0, len(items))
	for _, item := range items {
		if !item.Enabled || strings.TrimSpace(item.Key) == "" {
			continue
		}
		result = append(result, item)
	}
	return result
}

func normalizedTimeout(timeoutMs int) time.Duration {
	if timeoutMs <= 0 {
		return 30 * time.Second
	}
	return time.Duration(timeoutMs) * time.Millisecond
}

func applyHTTPSettings(req HttpRequest, settings SettingsStore) HttpRequest {
	if req.TimeoutMs <= 0 {
		req.TimeoutMs = settings.RequestTimeout
	}
	if req.TimeoutMs <= 0 {
		req.TimeoutMs = 30000
	}
	return req
}

func applyHTTPVersion(req *http.Request, version string) {
	switch strings.TrimSpace(strings.ToUpper(version)) {
	case "HTTP/2":
		req.ProtoMajor = 2
		req.ProtoMinor = 0
		req.Proto = "HTTP/2.0"
	default:
		req.ProtoMajor = 1
		req.ProtoMinor = 1
		req.Proto = "HTTP/1.1"
	}
}

func buildHTTPClient(settings SettingsStore, timeout time.Duration) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ForceAttemptHTTP2 = strings.TrimSpace(strings.ToUpper(settings.HTTPVersion)) == "HTTP/2"
	transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: !settings.SSLVerification}

	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}
	if !settings.FollowRedirects {
		client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	return client
}

func readHTTPResponseBody(body io.Reader, maxResponseSizeMB int) ([]byte, bool, error) {
	maxBytes := normalizeMaxResponseSize(maxResponseSizeMB)
	limited := io.LimitReader(body, int64(maxBytes+1))
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, false, err
	}
	if len(data) <= maxBytes {
		return data, false, nil
	}
	return data[:maxBytes], true, nil
}

func normalizeMaxResponseSize(maxResponseSizeMB int) int {
	if maxResponseSizeMB <= 0 {
		return 50 * 1024 * 1024
	}
	return maxResponseSizeMB * 1024 * 1024
}

func summarizeJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}
