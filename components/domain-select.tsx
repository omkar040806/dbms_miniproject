import { Select } from "@/components/ui/field";
import type { Domain } from "@/lib/types";

/** Domain dropdown that shows the hierarchy: parents first, children indented under them. */
export function DomainSelect({
  domains,
  emptyLabel,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { domains: Domain[]; emptyLabel?: string }) {
  const roots = domains.filter((d) => d.parent_domain_id === null);
  return (
    <Select {...props}>
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {roots.map((root) => (
        <optgroup key={root.domain_id} label={root.name}>
          <option value={root.domain_id}>{root.name} (all)</option>
          {domains
            .filter((d) => d.parent_domain_id === root.domain_id)
            .map((child) => (
              <option key={child.domain_id} value={child.domain_id}>
                {child.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}
