# CNC Studio - Arc Renderer Fix

Bản này giữ nguyên layout Code + 2D. Sửa renderer G02/G03 để dựng cung từ tâm, bán kính, điểm đầu và sweep trong hệ tọa độ CNC rồi chiếu từng điểm lên canvas. Không dùng Canvas arc direction trực tiếp nên tránh lỗi đảo trục Y.

Đã giữ hỗ trợ CR -> R trong parser hiện tại.

- Diagonal moves are dimensioned by their X/Y width and height components, not by diagonal length.
