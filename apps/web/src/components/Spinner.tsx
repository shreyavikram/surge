/** The small green loading mark, shown beside a button while its request is running. */
export function Spinner({ label = 'Working…' }: { label?: string }) {
  return <img className="btn-spinner" src="/brand/greenfield-loading.svg" alt={label} title={label} />;
}
