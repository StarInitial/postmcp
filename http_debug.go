package main

import (
	"bytes"
	"context"
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
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), normalizedTimeout(req.TimeoutMs))
	defer cancel()

	resolvedURL, err := buildURL(req.URL, req.Query)
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

	for _, header := range enabledPairs(req.Headers) {
		httpReq.Header.Set(header.Key, header.Value)
	}
	applyHTTPCookies(httpReq, resolvedURL, req.CookieScopes)
	if contentType != "" && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", contentType)
	}
	applyHTTPAuth(httpReq, req.Auth)

	client := &http.Client{Timeout: normalizedTimeout(req.TimeoutMs)}
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

	body, readErr := io.ReadAll(resp.Body)
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

func buildURL(rawURL string, query []KeyValuePair) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return "", fmt.Errorf("parse url: %w", err)
	}
	values := parsed.Query()
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

func applyHTTPAuth(req *http.Request, auth HttpAuth) {
	switch auth.Type {
	case "basic":
		creds := base64.StdEncoding.EncodeToString([]byte(auth.Username + ":" + auth.Password))
		req.Header.Set("Authorization", "Basic "+creds)
	case "bearer":
		if auth.Token != "" {
			req.Header.Set("Authorization", "Bearer "+auth.Token)
		}
	}
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

func summarizeJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}
