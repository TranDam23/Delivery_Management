import clsx from "clsx";
import { ContactType, CONTACT_TYPE_LABEL } from "@delivery/shared";

/** Mau badge theo vai tro lien he: gui = vang, nhan = xanh, ca hai = vien xam. */
const TYPE_CLASS: Record<ContactType, string> = {
  [ContactType.SENDER]: "border-dt-yellow/40 bg-dt-yellow/10 text-dt-yellow",
  [ContactType.RECEIVER]: "border-dt-green/40 bg-dt-green/10 text-dt-green",
  [ContactType.BOTH]: "border-dt-border bg-dt-panel2 text-dt-text",
};

export function ContactTypeBadge({ type }: { type: ContactType }): React.JSX.Element {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-[10px] py-[3px] text-[11px] font-medium",
        TYPE_CLASS[type],
      )}
    >
      {CONTACT_TYPE_LABEL[type]}
    </span>
  );
}
