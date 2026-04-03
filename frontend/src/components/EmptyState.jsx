function EmptyState({ text, icon = null, fill = false }) {
  return (
    <div className={`empty-state ${fill ? 'empty-state-fill' : ''}`.trim()}>
      {icon ? <div className="empty-state-icon" aria-hidden="true">{icon}</div> : null}
      <div>{text}</div>
    </div>
  )
}

export default EmptyState
