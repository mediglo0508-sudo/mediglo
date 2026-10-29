import * as React from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface AutocompleteOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface AutocompleteProps {
  options: AutocompleteOption[];
  value?: string;
  onSelect: (option: AutocompleteOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** When provided, a sticky "+ Add …" row appears for unmatched search terms. */
  onCreate?: (term: string) => void;
  createLabel?: (term: string) => string;
}

/**
 * Search-as-you-type dropdown. Replaces legacy static <Select> lists:
 * the operator types text and the list filters in real time (cmdk fuzzy
 * matching across label + sublabel) without any manual scrolling.
 */
export function Autocomplete({
  options,
  value,
  onSelect,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "No matches found.",
  className,
  disabled,
  onCreate,
  createLabel = (term) => `+ Add "${term}" as new Service/Product`,
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = options.find((o) => o.value === value);

  const term = search.trim();
  const exact = options.some((o) => o.label.toLowerCase().trim().replace(/^[^\p{L}\p{N}]+/u, "") === term.toLowerCase());
  const showCreate = !!onCreate && term.length > 0 && !exact;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command
          filter={(val, s) =>
            val.toLowerCase().includes(s.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            {!showCreate && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.sublabel ?? ""}`}
                  onSelect={() => {
                    onSelect(o);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="flex flex-col">
                    <span className="text-sm">{o.label}</span>
                    {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {showCreate && (
            <div className="border-t p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onCreate?.(term);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">{createLabel(term)}</span>
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
