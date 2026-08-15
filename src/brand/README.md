# Companion icon treatment

`wren-mark.svg` is byte-identical to Wren desktop's approved Character-flat
vector master. `src/icon.png` remains byte-identical to the canonical 512 px
desktop icon.

Browser toolbar and extension-manager icons keep the same tile but scale the
bird 1.12× around the canvas center. This raises its horizontal occupancy from
about 69% to 78%, matching the optical size of neighboring browser extensions
without changing the desktop mark. The 16 px state icons use the hinted
silhouette; connected icons use the green-tinted tile, and disconnected icons
use the muted monochrome treatment.
