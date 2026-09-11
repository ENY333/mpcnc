# CNC Studio Web v3 — 100K

Web CNC simulator/preview chạy thuần HTML/CSS/JavaScript, phù hợp GitHub Pages.

## Có gì trong bản này

- Live G-code -> 2D ngay khi gõ/xóa.
- PHAY: G00/G01/G02/G03, I/J/K, R/CR, G17/G18/G19, G90/G91, G90.1/G91.1.
- Canned cycle phay: G73/G74/G76/G81-G89 và modal repeat của cycle.
- TIỆN X/Z: G70-G76, G90/G92/G94 theo profile Haas/FANUC ở mức preview hình học.
- LinuxCNC: G90/G91 distance mode và nhóm modal chính.
- G20/G21, G93/G94/G95, G96/G97, G98/G99, G40-G43/G49.
- G54-G59, G10 L2/L20, G52, G92/G92.1.
- G68/G69 rotation, G51 scale, G100/G101 mirror preview.
- M03/M04/M05, M06, M07/M08/M09, M98/M99 diagnostics.
- Macro variable cơ bản dạng `#100=...`, `#<NAME>=...` và tham chiếu số đơn giản.
- Chẩn đoán G/M code chưa hỗ trợ, click cảnh báo để nhảy tới dòng.
- Auto-fit có gốc tọa độ; zoom/pan; mô phỏng Run/Pause/Stop/Step.
- Controller selector: FANUC / HAAS / LinuxCNC.
- `CR-20` được chuẩn hóa thành `R-20`.

## Kiểm thử

- Tổng source: **100,000+ dòng**.
- Generated validation corpus: **99,723 case**.
- Smoke tests cho: chương trình phay mẫu, G81 modal, tiện G76, G90/G91 LinuxCNC.
- Generated corpus: **99,723 pass / 0 fail**.

## Lưu ý quan trọng

G-code phụ thuộc controller. Cùng một mã có thể mang nghĩa khác nhau giữa Haas Lathe, Haas Mill, FANUC và LinuxCNC. Bản preview này ưu tiên nhận diện modal và hình học, không tuyên bố thay thế bộ điều khiển máy thật.

Tài liệu tham chiếu: LinuxCNC G-code quick reference và Haas Mill/Lathe G-code lists.


## 2D dimensions
The 2D view displays numeric dimension ticks along X and Y/Z axes. Zoom controls and wheel zoom are disabled; Fit remains available for automatic framing.


## ARC Renderer
G02/G03 are rendered as true circular arcs in the 2D canvas using the engine's computed center, radius and sweep. The segmented representation remains available for simulation.
