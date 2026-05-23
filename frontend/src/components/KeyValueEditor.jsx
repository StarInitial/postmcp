import { useMemo, useState } from 'react'
import { Button, Input } from '@fluentui/react-components'
import { DeleteRegular } from '@fluentui/react-icons'

import { newPair } from '../features/workbench/lib/defaults'

function updateArrayRow(rows, index, patch) {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
}

function KeyValueEditor({ title, rows, onChange, hiddenRows = [], onToggleHiddenRow, lockHiddenRowSelection = false, showHiddenButton = false }) {
  const safeRows = (rows || []).map((item) => ({ ...newPair(), ...item }))
  const [showHiddenRows, setShowHiddenRows] = useState(false)
  const normalizedHiddenRows = useMemo(
    () => (hiddenRows || []).map((item) => ({ ...newPair(), ...item })),
    [hiddenRows],
  )
  const hiddenCount = normalizedHiddenRows.length

  return (
    <div className="key-value-editor">
      <div className="editor-section-header">
        <strong>{title}</strong>
        <div className="editor-section-actions">
          {showHiddenButton && (
            <Button size="small" appearance="subtle" onClick={() => setShowHiddenRows((current) => !current)} disabled={hiddenCount === 0}>
              {`${hiddenCount}个隐藏元素`}
            </Button>
          )}
          <Button size="small" onClick={() => onChange([...safeRows, newPair()])}>添加行</Button>
        </div>
      </div>
      {!safeRows.length && !(showHiddenRows && hiddenCount > 0) && <div className="table-empty-state">空表格，点击添加行按钮以新增数据。</div>}
      {(!!safeRows.length || (showHiddenRows && hiddenCount > 0)) && (
        <div className="kv-table">
          {showHiddenRows && normalizedHiddenRows.map((row) => (
            <div className="kv-row kv-row-hidden" key={`hidden-${row.id}`}>
              <input
                type="checkbox"
                checked={lockHiddenRowSelection || row.locked ? true : row.enabled}
                disabled={lockHiddenRowSelection || row.locked}
                onChange={(event) => {
                  if (lockHiddenRowSelection || row.locked) {
                    return
                  }
                  onToggleHiddenRow?.(row.hiddenFieldId, event.target.checked)
                }}
              />
              <Input value={row.key} placeholder="Key" readOnly />
              <Input value={row.value} placeholder="Value" readOnly />
              <div className="kv-hidden-placeholder" />
            </div>
          ))}
          {safeRows.map((row, index) => (
            <div className="kv-row" key={row.id || index}>
              <input type="checkbox" checked={row.enabled} onChange={(event) => onChange(updateArrayRow(safeRows, index, { enabled: event.target.checked }))} />
              <Input value={row.key} placeholder="Key" onChange={(_, data) => onChange(updateArrayRow(safeRows, index, { key: data.value }))} />
              <Input value={row.value} placeholder="Value" onChange={(_, data) => onChange(updateArrayRow(safeRows, index, { value: data.value }))} />
              <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => onChange(safeRows.filter((item) => item.id !== row.id))} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default KeyValueEditor
