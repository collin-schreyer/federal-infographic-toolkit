import sharp from 'sharp';

// Pixel-perfect logo placement. The image models are instructed to RESERVE a
// clean corner (see logoClause in variant-overrides.ts) but never to draw the
// logo themselves — models redraw reference images, which warps fine detail
// and shifts colors. Instead we composite the user's actual logo file onto
// the finished render here, so the logo on every variant is literally the
// user's own pixels, untouched.

const dataUrlToBuffer = (dataUrl: string): Buffer => {
  const [, b64] = dataUrl.split(',');
  return Buffer.from(b64, 'base64');
};

export type LogoPosition = 'top-left' | 'footer-corner';

export async function compositeLogo(
  imageDataUrl: string,
  logoDataUrl: string,
  position: LogoPosition,
): Promise<string> {
  const canvasBuf = dataUrlToBuffer(imageDataUrl);
  const logoBuf = dataUrlToBuffer(logoDataUrl);

  const canvasMeta = await sharp(canvasBuf).metadata();
  const W = canvasMeta.width;
  const H = canvasMeta.height;
  if (!W || !H) throw new Error('Could not read generated image dimensions.');

  // Logo box: up to 16% of canvas width / 10% of height, aspect preserved.
  // withoutEnlargement keeps low-res logo uploads from being blown up blurry.
  const resizedLogo = await sharp(logoBuf)
    .resize({
      width: Math.round(W * 0.16),
      height: Math.round(H * 0.10),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const logoMeta = await sharp(resizedLogo).metadata();
  const lw = logoMeta.width ?? 0;
  const lh = logoMeta.height ?? 0;
  const margin = Math.round(W * 0.025);

  const left = position === 'footer-corner' ? W - lw - margin : margin;
  const top = position === 'footer-corner' ? H - lh - margin : margin;

  const out = await sharp(canvasBuf)
    .composite([{ input: resizedLogo, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer();

  return `data:image/png;base64,${out.toString('base64')}`;
}
