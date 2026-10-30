import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomerDrawer } from "@/components/customers/CustomerDrawer";
import { ilikeOrClause } from "@/lib/utils";
import type { Customer } from "@/types/domain";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers_list", search],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(100);
      if (search.trim()) {
        q = q.or(`${ilikeOrClause("name", search)},${ilikeOrClause("phone", search)}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Customer[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
      </div>

      <Input
        placeholder="Search by name or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : (customers ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              customers!.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onDoubleClick={() => setSelected(c.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelected(c.id)}
                >
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell>{c.city ?? "-"}</TableCell>
                  <TableCell>{c.email ?? "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">Double-click (or select + Enter) a row to open the full profile.</p>

      <CustomerDrawer customerId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
