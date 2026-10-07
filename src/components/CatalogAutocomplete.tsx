import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchSpecies, searchVariants } from "../services/catalogSearchService";
import type { Species, SpeciesVariant } from "../types";

type SearchOption = { id: string; primary: string; secondary?: string };

type CatalogAutocompleteProps = {
  id?: string;
  value: string;
  allOptions: SearchOption[];
  search: (query: string) => SearchOption[];
  onChange: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
  ariaLabel: string;
};

function CatalogAutocomplete({ id, value, allOptions, search, onChange, placeholder, emptyLabel, ariaLabel }: CatalogAutocompleteProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const selected = allOptions.find((item) => item.id === value);
  const [query, setQuery] = useState(selected?.primary ?? "");
  const [open, setOpen] = useState(false);
  const editingRef = useRef(false);
  const options = search(query);

  useEffect(() => {
    if (!editingRef.current) setQuery(selected?.primary ?? "");
  }, [selected?.primary]);

  return (
    <div className="relative mt-2 scroll-mt-24">
      <div className="flex min-h-12 items-center gap-2 rounded-lg border border-line bg-card px-3 focus-within:border-accent">
        <Search size={17} className="shrink-0 text-secondary" aria-hidden="true" />
        <input
          id={inputId}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={`${inputId}-options`}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onFocus={(event) => { setOpen(true); event.currentTarget.select(); }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            editingRef.current = true;
            setQuery(event.target.value);
            setOpen(true);
          }}
          className="min-w-0 flex-1 bg-transparent py-3 text-sm font-normal text-primary outline-none placeholder:text-secondary"
        />
        {query || value ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { editingRef.current = true; setQuery(""); onChange(""); setOpen(true); }}
            className="grid h-9 w-9 shrink-0 place-items-center text-secondary"
            aria-label="Limpiar selección"
            title="Limpiar selección"
          >
            <X size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={`${inputId}-options`} role="listbox" className="mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 shadow-panel">
          {!value ? <button type="button" role="option" aria-selected="true" onMouseDown={(event) => event.preventDefault()} onClick={() => { editingRef.current = false; setQuery(""); onChange(""); setOpen(false); }} className="min-h-11 w-full rounded-md px-3 text-left text-sm text-secondary">{emptyLabel}</button> : null}
          {options.length ? options.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { editingRef.current = false; setQuery(item.primary); onChange(item.id); setOpen(false); }}
              className={`min-h-12 w-full rounded-md px-3 py-2 text-left ${item.id === value ? "bg-soft" : "hover:bg-card"}`}
            >
              <span className="block text-sm font-semibold text-primary">{item.primary}</span>
              {item.secondary ? <span className="block truncate text-xs italic text-secondary">{item.secondary}</span> : null}
            </button>
          )) : <p className="px-3 py-4 text-sm text-secondary">No se encontraron coincidencias.</p>}
        </div>
      ) : null}
    </div>
  );
}

export function SpeciesAutocomplete({ id, value, items, onChange, placeholder = "Buscar especie...", emptyLabel = "Sin especie seleccionada" }: { id?: string; value: string; items: Species[]; onChange: (id: string) => void; placeholder?: string; emptyLabel?: string }) {
  const allOptions = items.map((item) => ({ id: item.id, primary: item.commonName, secondary: item.scientificName }));
  const search = (query: string) => searchSpecies(items, query, 8).map((item) => ({ id: item.id, primary: item.commonName, secondary: item.scientificName }));
  return <CatalogAutocomplete id={id} value={value} allOptions={allOptions} search={search} onChange={onChange} placeholder={placeholder} emptyLabel={emptyLabel} ariaLabel="Buscar especie" />;
}

export function VariantAutocomplete({ id, value, items, onChange }: { id?: string; value: string; items: SpeciesVariant[]; onChange: (id: string) => void }) {
  const allOptions = items.map((item) => ({ id: item.id, primary: item.name }));
  const search = (query: string) => searchVariants(items, query, 8).map((item) => ({ id: item.id, primary: item.name }));
  return <CatalogAutocomplete id={id} value={value} allOptions={allOptions} search={search} onChange={onChange} placeholder="Buscar raza o variante..." emptyLabel="Raza no determinada" ariaLabel="Buscar raza o variante" />;
}
