// Illustrative *localized* deformation, not an injury/energy-validated crush model.
// Operates in vehicle local space: front +Z, rear -Z, right +X, left -X.
export const CRUSH_MAX_FRAC = 0.38
export const crushDepth = (Leff, crush) => Math.max(0,Number(crush)||0)*Leff*CRUSH_MAX_FRAC
function random3(x,y,z) {
  const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453
  return s-Math.floor(s)-0.5
}
const sat = v => Math.max(0,Math.min(1,v))
/**
 * zone can be front, rear, left, right or roof.
 * All geometry is recomputed from orig, so replay before time 0 is undamaged.
 * offset -1..1 means position along the impact surface.
 */
export function deformPositions(orig,out,dims,crush,offset=0,zone='front') {
  const amount=sat(+crush || 0)
  if(amount<=0.0005) {out.set(orig);return}
  const {frontZ,Leff,W,H}=dims
  const rearZ=frontZ-Leff
  const midZ=(frontZ+rearZ)/2
  const off=sat(Math.abs(+offset || 0))*Math.sign(+offset || 0)
  const frontBack=zone==='front'||zone==='rear'
  const side=zone==='left'||zone==='right'
  const roof=zone==='roof'
  const D=crushDepth(frontBack?Leff:side?W:H,amount)
  const sigma=(frontBack?W:side?Leff:W)*(0.45-0.20*Math.abs(off))
  for(let i=0;i<orig.length;i+=3) {
    const x=orig[i],y=orig[i+1],z=orig[i+2]
    let normal=0,along=0,center=0
    if(zone==='rear') {normal=sat((rearZ+Leff*.55-z)/(Leff*.55));along=x;center=off*W*.5}
    else if(zone==='left') {normal=sat((-x-W*.5+W*.55)/(W*.55));along=z-midZ;center=off*Leff*.4}
    else if(zone==='right') {normal=sat((x-W*.5+W*.55)/(W*.55));along=z-midZ;center=off*Leff*.4}
    else if(roof) {normal=sat((y-H*.45)/(Math.max(.1,H*.55)));along=x;center=off*W*.35}
    else {normal=sat((z-frontZ+Leff*.55)/(Leff*.55));along=x;center=off*W*.5}
    const spread=Math.exp(-0.5*((along-center)/Math.max(.15,sigma))**2)
    const w=normal*spread
    const r=random3(x,y,z),r2=random3(y,z,x),r3=random3(z,x,y)
    let dx=r*.065*D*w,dy=r2*.055*D*w,dz=r3*.065*D*w
    if(zone==='rear') dz+=D*w
    else if(zone==='left') dx+=D*w
    else if(zone==='right') dx-=D*w
    else if(roof) dy-=D*w
    else dz-=D*w
    out[i]=x+dx;out[i+1]=y+dy;out[i+2]=z+dz
  }
}