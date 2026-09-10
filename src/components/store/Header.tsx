"use client";
import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";
import { SITE } from "@/lib/site";
export function Header() { const cart = useCart(); return <header className="border-b border-slate-200"><nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6"><Link href="/" className="text-xl font-semibold">{SITE.name}</Link><div className="flex items-center gap-6"><Link href="/kontakt">Kontakt</Link><button onClick={cart.open}>Handlekurv ({cart.count})</button></div></nav></header>; }
