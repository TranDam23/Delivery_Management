import { Box } from "lucide-react";
import { Card, CardLabel } from "@/components/ui/card";
import { formatVnd, type OrderDetail } from "@/lib/order-ui";

type GoodsItem = OrderDetail["order_items"][number];

function dimensionsText(item: GoodsItem): string {
  if (item.length == null || item.width == null || item.height == null) return "—";
  return `${item.length} × ${item.width} × ${item.height} cm`;
}

export function OrderGoodsCard({ items, deliveryNote }: { items: GoodsItem[]; deliveryNote: string | null }): React.JSX.Element {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div><CardLabel>Hàng hóa</CardLabel><p className="mt-1 text-[11px] text-dt-muted">{items.length} mặt hàng</p></div>
        <Box className="text-dt-yellow" size={18} />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[11px]">
          <thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted">
            <tr><th className="py-2 font-medium">Tên hàng</th><th className="py-2 font-medium">Loại</th><th className="py-2 text-right font-medium">SL</th><th className="py-2 text-right font-medium">Khối lượng</th><th className="py-2 text-right font-medium">D × R × C</th><th className="py-2 text-right font-medium">Khai giá</th></tr>
          </thead>
          <tbody>{items.map((item) => (
            <tr key={item.id} className="border-b border-dt-border/70 last:border-0">
              <td className="py-3">{item.item_name}{item.note ? <p className="mt-1 text-dt-muted">{item.note}</p> : null}</td>
              <td className="py-3 text-dt-muted">{item.item_type ?? "—"}</td>
              <td className="py-3 text-right">{item.quantity}</td>
              <td className="py-3 text-right text-dt-muted">{item.weight != null ? `${item.weight} kg` : "—"}</td>
              <td className="py-3 text-right text-dt-muted">{dimensionsText(item)}</td>
              <td className="py-3 text-right text-dt-muted">{item.declared_value != null ? formatVnd(Number(item.declared_value)) : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {deliveryNote ? <p className="mt-4 rounded-md bg-dt-panel2 p-3 text-[11px] leading-5 text-dt-muted"><strong className="text-dt-text">Ghi chú giao hàng:</strong> {deliveryNote}</p> : null}
    </Card>
  );
}
