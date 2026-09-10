import { Header } from "@/components/store/Header";
import { Footer } from "@/components/store/Footer";
import { ProductHero } from "@/components/store/ProductHero";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { PRODUCTS } from "@/lib/products";
export default function Home() {
 return <><Header /><main><div className="mx-auto max-w-6xl px-6 pt-8 text-sm text-slate-500">Butikkmal · eksempeldata · ikke klar for salg</div>{PRODUCTS.map(product => <ProductHero key={product.slug} product={product} />)}</main><Footer /><CartDrawer /></>;
}
