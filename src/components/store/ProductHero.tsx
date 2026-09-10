"use client";
import Image from "next/image";
import { VariantStockStatus } from "@/components/inventory/StockNotice";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { fmtKr } from "@/lib/format";
import type { Product } from "@/lib/products";
export function ProductHero({ product }: { product: Product }) {
 const cart = useCart();
 const [colorId, setColorId] = useState(product.colors[0].id);
 const [qty, setQty] = useState(1);
 const color = product.colors.find(c => c.id === colorId) ?? product.colors[0];
 return <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-2">
  <div className="relative aspect-square bg-slate-100"><Image src={color.image} alt={`${product.name}, ${color.name}`} fill priority className="object-contain" sizes="(max-width: 768px) 100vw, 50vw" /></div>
  <div className="self-center"><h1 className="text-4xl font-semibold tracking-tight">{product.name}</h1><p className="mt-5 text-lg">{product.tagline}</p><p className="mt-4 text-slate-600">{product.blurb}</p><p className="my-6 text-2xl font-semibold">{fmtKr(product.priceNok)}</p>
  <label className="block text-sm">Variant<select value={colorId} onChange={e => setColorId(e.target.value)} className="mt-2 block w-full rounded border p-3">{product.colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label className="mt-4 block text-sm">Antall<input type="number" min={1} max={99} value={qty} onChange={e => setQty(Math.max(1, Math.min(99, Math.floor(Number(e.target.value)) || 1)))} className="ml-4 w-20 rounded border p-2" /></label>
  <button className="mt-6 w-full rounded bg-blue-700 p-4 font-semibold text-white hover:bg-blue-800" onClick={() => cart.add({ slug: product.slug, name: product.name, colorId: color.id, colorName: color.name, colorImage: color.image, priceNok: product.priceNok }, qty)}>Legg i handlekurven</button><VariantStockStatus slug={product.slug} colorId={color.id} /></div></section>;
}
