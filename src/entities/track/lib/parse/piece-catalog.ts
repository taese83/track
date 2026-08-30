// _workspace/02_design/piece-geometry.md
export interface PieceEndpointOffsets {
  label: string
  vertex1: { x: number; y: number }
  vertex2: { x: number; y: number }
}

export const PIECE_CATALOG: Readonly<Record<string, PieceEndpointOffsets>> = {
  Str1: { label: 'straight', vertex1: { x: -27, y: 0 }, vertex2: { x: 27, y: 0 } },
  Str2: { label: 'start', vertex1: { x: -27, y: 0 }, vertex2: { x: 27, y: 0 } },
  Str3: { label: '1/4 straight', vertex1: { x: -15, y: 0 }, vertex2: { x: 15, y: 0 } },
  Str4: { label: '1/2 straight', vertex1: { x: -30, y: 0 }, vertex2: { x: 30, y: 0 } },
  Str5: { label: '3/4 straight', vertex1: { x: -45, y: 0 }, vertex2: { x: 45, y: 0 } },
  Str6: { label: 'straight', vertex1: { x: -60, y: 0 }, vertex2: { x: 60, y: 0 } },
  Cor1: { label: '45° corner', vertex1: { x: -26, y: -8 }, vertex2: { x: 12.2, y: 7.8 } },
  Cor2: { label: '45° corner', vertex1: { x: -36, y: -6 }, vertex2: { x: 6.42, y: 11.58 } },
  Cor3: { label: '90° corner', vertex1: { x: -45, y: -15 }, vertex2: { x: 15, y: 45 } },
  Cor4: { label: 'digital curve', vertex1: { x: -45, y: -15 }, vertex2: { x: 15, y: 45 } },
  Cor5: { label: 'r2100 curve', vertex1: { x: -105, y: -75 }, vertex2: { x: 75, y: 105 } },
  Ban1: { label: 'bank', vertex1: { x: -14, y: 0 }, vertex2: { x: 14, y: 0 } },
  Ban2: { label: 'bank', vertex1: { x: -27, y: 0 }, vertex2: { x: 27, y: 0 } },
  Bri1: { label: 'slope', vertex1: { x: -27, y: 0 }, vertex2: { x: 27, y: 0 } },
  Bri2: { label: 'jump', vertex1: { x: -27, y: 0 }, vertex2: { x: 27, y: 0 } },
  Bri3: { label: '1/2 slope', vertex1: { x: -30, y: 0 }, vertex2: { x: 30, y: 0 } },
  Bri4: { label: 'slope', vertex1: { x: -60, y: 0 }, vertex2: { x: 60, y: 0 } },
  Lan1: { label: 'lane changer', vertex1: { x: -81, y: 0 }, vertex2: { x: 81, y: 0 } },
  Lan2: { label: 'rainbow changer', vertex1: { x: -90, y: -54 }, vertex2: { x: -90, y: 54 } },
  Lan3: { label: 'burning changer', vertex1: { x: -45, y: -60 }, vertex2: { x: -45, y: 60 } },
  Lan4: { label: 'lane changer', vertex1: { x: -120, y: 0 }, vertex2: { x: 120, y: 0 } },
  Chi1: { label: 'wave', vertex1: { x: -27, y: 3 }, vertex2: { x: 27, y: 3 } },
  Chi2: { label: 'wave', vertex1: { x: -60, y: 6 }, vertex2: { x: 60, y: 6 } },
}

export function lookupPieceOffsets(pieceClass: string): PieceEndpointOffsets | undefined {
  return Object.prototype.hasOwnProperty.call(PIECE_CATALOG, pieceClass)
    ? PIECE_CATALOG[pieceClass]
    : undefined
}
