# CNC Studio Web

CNC Studio Web là giao diện CNC chạy **100% trên trình duyệt**, không cần Electron, Node.js hay backend.

## Chạy local

Mở `index.html` bằng trình duyệt.

Nếu trình duyệt chặn một số tính năng file, có thể dùng VS Code + Live Server.

## Đưa lên GitHub Pages

1. Tạo repository mới trên GitHub.
2. Upload toàn bộ:
   - `index.html`
   - `styles.css`
   - `app.js`
3. Vào **Settings → Pages**.
4. Chọn **Deploy from a branch**.
5. Chọn branch `main`, thư mục `/root`.
6. Save và chờ GitHub Pages deploy.

## Tính năng hiện tại

- Giao diện desktop tối ưu cho màn hình máy tính.
- Chỉ tập trung **G-code + màn hình 2D**, không chiếm chỗ bằng 3D.
- Chế độ **PHAY**: X/Y.
- Chế độ **TIỆN**: X/Z.
- Phân tích G00/G01/G02/G03.
- Hỗ trợ G90/G91 cơ bản.
- Hiển thị đường chạy dao theo màu.
- Zoom bằng con lăn.
- Pan bằng kéo chuột.
- Fit view.
- Bật/tắt grid.
- Chạy / tạm dừng / dừng / chạy từng bước.
- Đọc file `.nc`, `.cnc`, `.gcode`, `.txt`.
- Tải G-code xuống.
- Thông số X/Y/Z/F/S/T.
- Preview tiện dùng cùng vùng 2D.

## Lưu ý

Đây là simulator/visualizer phía client, không kết nối trực tiếp tới máy CNC. Trước khi đưa G-code vào máy thật cần kiểm tra lại controller, hệ tọa độ, dao, tốc độ và độ sâu cắt.
