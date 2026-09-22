$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$config=Get-Content (Join-Path $PSScriptRoot 'build-input.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$assetRoot=$config.root
foreach($f in @('terrain','objects','plots','particles','crops','inventory','previews','masks')) {New-Item -ItemType Directory -Force (Join-Path $assetRoot $f)|Out-Null}
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'sources')|Out-Null
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Drawing.Drawing2D; using System.Collections.Generic;
public static class FarmArt {
 public static Bitmap Empty(int w,int h){return new Bitmap(w,h,PixelFormat.Format32bppArgb);}
 public static Graphics G(Bitmap b){var g=Graphics.FromImage(b);g.InterpolationMode=InterpolationMode.NearestNeighbor;g.PixelOffsetMode=PixelOffsetMode.Half;g.CompositingMode=CompositingMode.SourceOver;return g;}
 public static int[] Sprite(string source,int[] r,string dest,int w,int h,int threshold,int minComponent){
  using(var src=new Bitmap(source))using(var cut=src.Clone(new Rectangle(r[0],r[1],r[2],r[3]),PixelFormat.Format32bppArgb)){
   int cw=cut.Width,ch=cut.Height;var keep=new bool[cw*ch];
   for(int y=0;y<ch;y++)for(int x=0;x<cw;x++)keep[y*cw+x]=cut.GetPixel(x,y).A>=threshold;
   if(minComponent>0){var seen=new bool[keep.Length];
    for(int i=0;i<keep.Length;i++)if(keep[i]&&!seen[i]){
     var comp=new List<int>();var q=new Queue<int>();q.Enqueue(i);seen[i]=true;
     while(q.Count>0){int a=q.Dequeue();comp.Add(a);int ax=a%cw,ay=a/cw;
      for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=ax+dx,ny=ay+dy;if(nx<0||ny<0||nx>=cw||ny>=ch)continue;int n=ny*cw+nx;if(keep[n]&&!seen[n]){seen[n]=true;q.Enqueue(n);}}}
     if(comp.Count<minComponent)foreach(int a in comp)keep[a]=false;
    }
   }
   int l=cw,t=ch,rr=-1,bb=-1,count=0;
   for(int y=0;y<ch;y++)for(int x=0;x<cw;x++){if(!keep[y*cw+x]){cut.SetPixel(x,y,Color.Transparent);continue;}l=Math.Min(l,x);t=Math.Min(t,y);rr=Math.Max(rr,x);bb=Math.Max(bb,y);count++;}
   if(count==0)throw new Exception("Empty sprite "+dest);
   int bw=rr-l+1,bh=bb-t+1,pad=6;
   double scale=Math.Min((w-pad*2)/(double)bw,(h-pad*2)/(double)bh);
   int dw=Math.Max(1,(int)Math.Round(bw*scale)),dh=Math.Max(1,(int)Math.Round(bh*scale)),px=(w-dw)/2,py=h-pad-dh;
   using(var output=Empty(w,h)){using(var g=G(output))g.DrawImage(cut,new Rectangle(px,py,dw,dh),new Rectangle(l,t,bw,bh),GraphicsUnit.Pixel);output.Save(dest,ImageFormat.Png);}
   return new int[]{r[0]+l,r[1]+t,bw,bh,px,py,dw,dh,count,l==0||t==0||rr==cw-1||bb==ch-1?1:0};
  }
 }
 public static void Terrain(string source,int[] r,string dest){
  using(var src=new Bitmap(source))using(var output=Empty(768,512)){using(var g=G(output))g.DrawImage(src,new Rectangle(0,0,768,512),new Rectangle(r[0],r[1],r[2],r[3]),GraphicsUnit.Pixel);output.Save(dest,ImageFormat.Png);}
 }
 public static void Composite(string terrain,string dest,string[] files,int[] rects){
  using(var output=new Bitmap(terrain)){using(var g=G(output))for(int i=0;i<files.Length;i++)using(var s=new Bitmap(files[i]))g.DrawImage(s,new Rectangle(rects[i*4],rects[i*4+1],rects[i*4+2],rects[i*4+3]));output.Save(dest,ImageFormat.Png);}
 }
 public static void Contact(string[] files,string[] labels,string dest,int cols,int cw,int ch,bool dark){
  using(var output=Empty(cols*cw,((files.Length+cols-1)/cols)*ch))using(var g=G(output))using(var font=new Font("Arial",12,FontStyle.Bold)){
   g.Clear(dark?Color.FromArgb(38,52,48):Color.FromArgb(229,231,220));
   for(int i=0;i<files.Length;i++){int x=i%cols*cw,y=i/cols*ch;using(var s=new Bitmap(files[i])){double k=Math.Min((cw-12)/(double)s.Width,(ch-30)/(double)s.Height);int w=(int)(s.Width*k),h=(int)(s.Height*k);g.DrawImage(s,new Rectangle(x+(cw-w)/2,y+4,w,h));}g.DrawString(labels[i],font,dark?Brushes.White:Brushes.Black,x+6,y+ch-23);}output.Save(dest,ImageFormat.Png);
  }
 }
 public static int[] Validate(string file){using(var b=new Bitmap(file)){int visible=0,transparent=0,edge=0;for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++){if(b.GetPixel(x,y).A==0)transparent++;else{visible++;if(x==0||y==0||x==b.Width-1||y==b.Height-1)edge++;}}return new int[]{b.Width,b.Height,visible,transparent,edge};}}
}
'@
$record=[System.Collections.Generic.List[object]]::new()
function Source([string]$key){return Join-Path $config.genRoot $config.sources.$key}
function Export-Sprite($source,$rect,$relative,$width,$height,$threshold=32,$minComponent=0){
 $dest=Join-Path $assetRoot $relative
 New-Item -ItemType Directory -Force (Split-Path $dest)|Out-Null
 $s=[FarmArt]::Sprite($source,[int[]]$rect,$dest,$width,$height,$threshold,$minComponent)
 $record.Add([ordered]@{file=$relative;size=@($width,$height);anchor=@([int]($width/2),($height-6));sourceBounds=@($s[0],$s[1],$s[2],$s[3]);contentBounds=@($s[4],$s[5],$s[6],$s[7]);sourceEdgeTouched=($s[9]-eq 1)})
}
foreach($p in $config.sources.PSObject.Properties){Copy-Item -LiteralPath (Join-Path $config.genRoot $p.Value) -Destination (Join-Path $PSScriptRoot "sources/$($p.Name).png") -Force}
[FarmArt]::Terrain((Source 'meadow'),[int[]]@(0,0,1536,1024),(Join-Path $assetRoot 'terrain/meadow.png'))
for($group=0;$group-lt 3;$group++){for($i=0;$i-lt 4;$i++){[FarmArt]::Terrain((Source "terrain$($group+1)"),[int[]]@((($i%2)*768),([math]::Floor($i/2)*512),768,512),(Join-Path $assetRoot "terrain/$($config.terrainGroups[$group].ids[$i]).png"))}}
if($config.sources.lavender){[FarmArt]::Terrain((Source 'lavender'),[int[]]@(0,0,1536,1024),(Join-Path $assetRoot 'terrain/lavender.png'))}
foreach($skin in @('rustic','snow','sakura','volcanic')){for($i=0;$i-lt 12;$i++){$size=$config.propSizes[$i];$rect=$config.propRects[$i];if($skin -eq 'snow'){if($i -eq 1){$rect=@(435,0,287,404)};if($i -eq 2){$rect=@(722,0,382,404)};if($i -eq 3){$rect=@(1104,0,344,404)}};Export-Sprite (Source $skin) $rect "objects/$skin/$($config.propIds[$i]).png" $size[0] $size[1] 48 24}}
for($i=0;$i-lt 16;$i++){Export-Sprite (Source 'plots') @((($i%4)*384),(@(0,250,500,750)[[int][math]::Floor($i/4)]),384,(@(250,250,250,274)[[int][math]::Floor($i/4)])) "plots/$($config.plotIds[$i]).png" 216 124 48 12}
for($i=0;$i-lt 24;$i++){Export-Sprite (Source 'particles') @((($i%6)*256),([math]::Floor($i/6)*256),256,256) "particles/$($config.particleIds[$i]).png" 64 64 64 0}
for($i=0;$i-lt 62;$i++){
 $c=$i%8;$r=[int][math]::Floor($i/8);$x=$config.cropColumns[$c];$y=$config.cropRows[$c][$r]
 Export-Sprite 'C:/Personal Project/Farmodoro/assets/pixel/crops-atlas.png' @($x,$y,($config.cropColumns[$c+1]-$x),($config.cropRows[$c][$r+1]-$y)) "inventory/$($config.cropIds[$i]).png" 96 96 32 0
}
if($config.sources.fieldCrops){
 $src=Source 'fieldCrops';$im=[System.Drawing.Image]::FromFile($src);$cw=$im.Width/8;$ch=$im.Height/8;$im.Dispose()
 for($i=0;$i-lt 62;$i++){Export-Sprite $src @((@(0,157,314,470,627,784,940,1097)[$i%8]),([int][math]::Floor([math]::Floor($i/8)*$ch)),(@(157,157,156,157,157,156,157,157)[$i%8]),([int][math]::Floor(([math]::Floor($i/8)+1)*$ch)-[int][math]::Floor([math]::Floor($i/8)*$ch))) "crops/$($config.cropIds[$i]).png" 128 128 32 0}
}
$record|ConvertTo-Json -Depth 12|Set-Content (Join-Path $assetRoot 'sprite-metadata.json') -Encoding UTF8
$terrains=@(Get-ChildItem (Join-Path $assetRoot 'terrain') -Filter '*.png')
[FarmArt]::Contact([string[]]$terrains.FullName,[string[]]$terrains.BaseName,(Join-Path $assetRoot 'previews/terrain-overview.png'),4,384,280,$false)
foreach($skin in @('rustic','snow','sakura','volcanic')){
 $files=@($config.propIds|ForEach-Object{Join-Path $assetRoot "objects/$skin/$_.png"})
 [FarmArt]::Contact([string[]]$files,[string[]]$config.propIds,(Join-Path $assetRoot "previews/objects-$skin.png"),4,192,188,$true)
}
$checks=@(Get-ChildItem $assetRoot -Recurse -Filter '*.png'|Where-Object{$_.Directory.Name-notin @('previews','terrain','masks')}|ForEach-Object{
 $v=[FarmArt]::Validate($_.FullName);[ordered]@{file=$_.FullName.Substring($assetRoot.Length+1).Replace('\','/');width=$v[0];height=$v[1];visiblePixels=$v[2];transparentPixels=$v[3];visibleEdgePixels=$v[4]}
})
$checks|ConvertTo-Json -Depth 5|Set-Content (Join-Path $assetRoot 'validation.json') -Encoding UTF8
Write-Output "Exported $($record.Count) sprites and $($terrains.Count) terrain maps."
Write-Output 'Source edge warnings:'
$record|Where-Object sourceEdgeTouched|ForEach-Object{Write-Output $_.file}
Write-Output 'Invalid sprite outputs:'
$checks|Where-Object{$_.visiblePixels-eq 0 -or $_.transparentPixels-eq 0 -or $_.visibleEdgePixels-gt 0}|ConvertTo-Json



