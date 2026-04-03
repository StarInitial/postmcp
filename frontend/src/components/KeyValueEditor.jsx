import { Button, Input } from '@fluentui/react-components'
import { DeleteRegular } from '@fluentui/react-icons'

import { newPair } from '../features/workbench/lib/defaults'

function updateArrayRow(rows, index, patch) {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
}

function KeyValueEditor({ title, rows, onChange }) {
  const safeRows = (rows || []).map((item) => ({ ...newPair(), ...item }))

  return (
    <div className="key-value-editor">
      <div className="editor-section-header">
        <strong>{title}</strong>
        <Button size="small" onClick={() => onChange([...safeRows, newPair()])}>添加行</Button>
      </div>
      {!safeRows.length && <div className="table-empty-state">空表格，点击添加行按钮以新增数据。</div>}
      {!!safeRows.length && (
        <div className="kv-table">
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
