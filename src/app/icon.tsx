import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";
export const alt = SITE.name;
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function Image() { return new ImageResponse(<div style={{display:"flex",width:"100%",height:"100%",alignItems:"center",justifyContent:"center",background:"#172033",color:"white",fontSize:32}}>{SITE.name}</div>,size); }
