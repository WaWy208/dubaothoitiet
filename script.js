/* ══════════════════════════════════════════
   CÀ MAU MỚI WEATHER — UPGRADED SCRIPT (Cà Mau + Bạc Liêu cũ)
   Tính năng: 147 xã/phường/thị trấn, so sánh vùng, biểu đồ nhiệt độ,
   đổi °C/°F, light/dark, tìm kiếm, modal chi tiết, tab navigation
══════════════════════════════════════════ */

// ── STATE ──
const STATE = {
  unit: 'C',
  theme: 'dark',
  selectedWard: null,
  compareA: null,
  compareB: null,
  comparePicking: null,
  currentDistrict: 'all'
};

// ── 64 XÃ / PHƯỜNG / THỊ TRẤN CÀ MAU ──
const WARDS = [
  // TP. CÀ MAU (9 phường + 1 xã)
  { id:1,  name:'Phường 1',       district:'TP. Cà Mau', type:'Phường', icon:'🌆', temp:32, hi:35, lo:27, rain:65, humidity:82, wind:18, aqi:50, desc:'Mưa rào', features:['Trung tâm thành phố','Khu dân cư đông đúc'], alert:null, note:'Khu vực trung tâm hành chính. Nhiệt độ cao do bê-tông hóa, ít cây xanh.' },
  { id:2,  name:'Phường 2',       district:'TP. Cà Mau', type:'Phường', icon:'🏙️', temp:33, hi:36, lo:27, rain:60, humidity:80, wind:17, aqi:52, desc:'Có mây',   features:['Khu thương mại','Chợ trung tâm'],       alert:null, note:'Gần chợ Cà Mau, giao thương sầm uất. Độ ẩm cao vào buổi sáng.' },
  { id:3,  name:'Phường 4',       district:'TP. Cà Mau', type:'Phường', icon:'🏙️', temp:32, hi:35, lo:26, rain:70, humidity:83, wind:16, aqi:48, desc:'Mưa nhẹ', features:['Khu vực nội ô','Hành chính'],              alert:null, note:'Mưa chiều thường xuyên. Người dân cần chuẩn bị áo mưa khi ra đường từ 14h.' },
  { id:4,  name:'Phường 5',       district:'TP. Cà Mau', type:'Phường', icon:'🌆', temp:33, hi:36, lo:27, rain:55, humidity:79, wind:19, aqi:53, desc:'Nắng nhẹ', features:['Khu dân cư','Bệnh viện tỉnh'],             alert:null, note:'Gần Bệnh viện đa khoa Cà Mau. Thời tiết thường ổn định hơn các phường khác.' },
  { id:5,  name:'Phường 6',       district:'TP. Cà Mau', type:'Phường', icon:'🏙️', temp:31, hi:34, lo:26, rain:72, humidity:85, wind:15, aqi:47, desc:'Mưa rào',  features:['Gần sông Gành Hào','Ven nước'],             alert:'Lũ nhẹ', note:'Vùng trũng thấp ven sông. Mưa lớn có nguy cơ ngập cục bộ.' },
  { id:6,  name:'Phường 7',       district:'TP. Cà Mau', type:'Phường', icon:'🌆', temp:32, hi:35, lo:27, rain:62, humidity:81, wind:18, aqi:51, desc:'Có mây',   features:['Khu ven đô','Công nghiệp nhẹ'],             alert:null, note:'Thời tiết ổn định, ít ảnh hưởng bởi triều cường.' },
  { id:7,  name:'Phường 8',       district:'TP. Cà Mau', type:'Phường', icon:'🏙️', temp:31, hi:34, lo:26, rain:75, humidity:86, wind:14, aqi:45, desc:'Mưa to',   features:['Ven sông','Khu dân cư thấp'],              alert:'Lũ nhẹ', note:'Khu vực thấp, hay bị ngập khi mưa lớn kết hợp triều cường.' },
  { id:8,  name:'Phường 9',       district:'TP. Cà Mau', type:'Phường', icon:'🌆', temp:32, hi:35, lo:27, rain:58, humidity:80, wind:17, aqi:49, desc:'Ít mây',   features:['Mới phát triển','Khu dân cư mới'],          alert:null, note:'Khu đô thị mới. Ít ngập hơn các phường cũ. Nhiều cây xanh.' },
  { id:9,  name:'Tân Xuyên',      district:'TP. Cà Mau', type:'Xã',    icon:'🌳', temp:30, hi:33, lo:25, rain:78, humidity:88, wind:13, aqi:40, desc:'Mưa rải rác',features:['Nông nghiệp','Rừng đước ven đô'],          alert:null, note:'Xã ven rừng đước. Không khí trong lành, nhiệt độ thấp hơn nội ô 2-3°C.' },
  { id:10, name:'Lý Văn Lâm',     district:'TP. Cà Mau', type:'Xã',    icon:'🌿', temp:30, hi:33, lo:25, rain:80, humidity:89, wind:12, aqi:38, desc:'Mưa rào',  features:['Vành đai xanh','Nông nghiệp'],              alert:null, note:'Vành đai xanh phía Nam thành phố. Nhiều ao cá, vườn cây ăn trái.' },
  { id:11, name:'Định Bình',       district:'TP. Cà Mau', type:'Xã',    icon:'🌾', temp:30, hi:33, lo:25, rain:76, humidity:87, wind:13, aqi:41, desc:'Có mây',   features:['Lúa nước','Thuỷ sản'],                      alert:null, note:'Vùng sản xuất lúa - tôm. Thời tiết ảnh hưởng trực tiếp đến vụ mùa.' },

  // HUYỆN U MINH (8 xã + 1 thị trấn)
  { id:12, name:'TT. U Minh',      district:'U Minh', type:'Thị trấn', icon:'🏘️', temp:30, hi:33, lo:25, rain:82, humidity:90, wind:12, aqi:38, desc:'Mưa rào',  features:['Trung tâm huyện','Thương mại'],             alert:null, note:'Trung tâm hành chính huyện U Minh. Gần rừng U Minh Hạ, ẩm ướt quanh năm.' },
  { id:13, name:'Khánh Hòa',       district:'U Minh', type:'Xã',       icon:'🌿', temp:29, hi:32, lo:24, rain:85, humidity:92, wind:10, aqi:35, desc:'Mưa nhiều', features:['Rừng tràm','Sinh thái'],                    alert:null, note:'Tiếp giáp rừng U Minh. Ẩm độ cao nhất huyện, cần chú ý bảo quản thực phẩm.' },
  { id:14, name:'Khánh Thuận',     district:'U Minh', type:'Xã',       icon:'🌳', temp:29, hi:32, lo:24, rain:84, humidity:91, wind:11, aqi:36, desc:'Mưa nhẹ',  features:['Kênh rạch','Nông nghiệp'],                  alert:null, note:'Vùng kênh rạch dày đặc. Xuồng ghe là phương tiện di chuyển chính.' },
  { id:15, name:'Nguyễn Phích',    district:'U Minh', type:'Xã',       icon:'🌾', temp:30, hi:33, lo:25, rain:80, humidity:89, wind:12, aqi:39, desc:'Có mây',   features:['Tôm - lúa','Vùng đệm rừng'],               alert:null, note:'Vùng đệm rừng U Minh. Mô hình tôm-lúa phổ biến. Thời tiết tương đối ổn.' },
  { id:16, name:'Khánh Lâm',       district:'U Minh', type:'Xã',       icon:'🌲', temp:29, hi:32, lo:24, rain:86, humidity:92, wind:10, aqi:34, desc:'Mưa rào',  features:['Rừng U Minh Hạ','Đa dạng sinh học'],        alert:null, note:'Cửa ngõ vào rừng U Minh Hạ. Mưa nhiều, đường sá thường bị ngập mùa lũ.' },
  { id:17, name:'Khánh An',        district:'U Minh', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:83, humidity:90, wind:11, aqi:37, desc:'Mưa nhẹ',  features:['Biên giới Kiên Giang','Nông nghiệp'],       alert:null, note:'Giáp ranh Kiên Giang. Vùng sản xuất nông nghiệp rộng lớn.' },
  { id:18, name:'Vĩnh Khánh',      district:'U Minh', type:'Xã',       icon:'🌾', temp:30, hi:33, lo:25, rain:81, humidity:89, wind:12, aqi:38, desc:'Có mây',   features:['Kênh chính','Xây dựng mới'],                alert:null, note:'Xã đang phát triển, nhiều kênh thủy lợi mới. Ít bị ảnh hưởng bởi lũ nhờ đê bao.' },
  { id:19, name:'Khánh Bình Tây',  district:'U Minh', type:'Xã',       icon:'🌳', temp:29, hi:32, lo:24, rain:84, humidity:91, wind:10, aqi:35, desc:'Mưa rào',  features:['Vùng sâu','Sông Trẹm'],                    alert:null, note:'Vùng sâu vùng xa, tiếp giáp sông Trẹm. Giao thông chủ yếu bằng đường thủy.' },
  { id:20, name:'Khánh Bình Đông', district:'U Minh', type:'Xã',       icon:'🌾', temp:30, hi:33, lo:25, rain:82, humidity:90, wind:11, aqi:37, desc:'Mưa nhẹ',  features:['Nông nghiệp','Thủy sản'],                   alert:null, note:'Vùng sản xuất thủy sản và nông nghiệp. Khí hậu ổn định trong mùa khô.' },

  // HUYỆN THỚI BÌNH (8 xã + 1 thị trấn)
  { id:21, name:'TT. Thới Bình',   district:'Thới Bình', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:74, humidity:85, wind:15, aqi:44, desc:'Có mây',   features:['Trung tâm huyện','Giao thương'],            alert:null, note:'Trung tâm huyện Thới Bình. Ngã tư quan trọng kết nối các xã phía Bắc Cà Mau.' },
  { id:22, name:'Biển Bạch',       district:'Thới Bình', type:'Xã',       icon:'🌊', temp:31, hi:34, lo:26, rain:76, humidity:86, wind:16, aqi:42, desc:'Mưa nhẹ',  features:['Ven biển','Đánh bắt ven bờ'],               alert:null, note:'Xã ven vùng trũng. Chịu ảnh hưởng lũ từ thượng nguồn sông Cái Lớn vào mùa mưa.' },
  { id:23, name:'Biển Bạch Đông',  district:'Thới Bình', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:75, humidity:85, wind:15, aqi:43, desc:'Có mây',   features:['Nông nghiệp','Kênh đào'],                   alert:null, note:'Địa hình bằng phẳng, nhiều kênh đào. Trồng lúa và nuôi tôm xen canh.' },
  { id:24, name:'Tân Bằng',        district:'Thới Bình', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:79, humidity:88, wind:13, aqi:40, desc:'Mưa rào',  features:['Rừng tràm nhỏ','Thủy sản'],                 alert:null, note:'Có nhiều tiểu khu rừng tràm. Không khí trong lành, ít ô nhiễm.' },
  { id:25, name:'Thới Bình',       district:'Thới Bình', type:'Xã',       icon:'🌳', temp:31, hi:34, lo:26, rain:73, humidity:84, wind:16, aqi:45, desc:'Nắng nhẹ', features:['Lúa','Vườn cây'],                          alert:null, note:'Xã trù phú với nhiều vườn cây ăn trái. Mưa chiều thường xuyên từ tháng 5-11.' },
  { id:26, name:'Tân Phú',         district:'Thới Bình', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:71, humidity:83, wind:17, aqi:46, desc:'Ít mây',   features:['Nông nghiệp','Phát triển mới'],              alert:null, note:'Đang phát triển hạ tầng nông thôn mới. Điều kiện thời tiết thuận lợi cho sản xuất.' },
  { id:27, name:'Trí Phải',        district:'Thới Bình', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:77, humidity:87, wind:14, aqi:41, desc:'Mưa nhẹ',  features:['Sông Trẹm','Đánh bắt cá'],                  alert:null, note:'Ven sông Trẹm, nghề cá phát triển. Mùa lũ nước dâng cao, cần chú ý an toàn.' },
  { id:28, name:'Trí Lực',         district:'Thới Bình', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:72, humidity:84, wind:16, aqi:44, desc:'Có mây',   features:['Lúa - tôm','Nông thôn mới'],                alert:null, note:'Đạt chuẩn nông thôn mới. Hệ thống thủy lợi tốt, ít bị ngập úng.' },
  { id:29, name:'Hồ Thị Kỷ',      district:'Thới Bình', type:'Xã',       icon:'🌊', temp:30, hi:33, lo:25, rain:80, humidity:89, wind:12, aqi:38, desc:'Mưa rào',  features:['Đất phèn','Cải tạo đất'],                   alert:null, note:'Vùng đất phèn đang được cải tạo. Mưa lớn giúp rửa phèn nhưng dễ gây ngập.' },

  // HUYỆN TRẦN VĂN THỜI (9 xã + 1 thị trấn + 1 thị trấn)
  { id:30, name:'TT. Trần Văn Thời', district:'Trần Văn Thời', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:70, humidity:83, wind:17, aqi:46, desc:'Nắng nhẹ', features:['Trung tâm huyện','Thương mại'],  alert:null, note:'Trung tâm huyện Trần Văn Thời. Giao thông thuận tiện, ít bị ngập do địa hình cao.' },
  { id:31, name:'TT. Sông Đốc',    district:'Trần Văn Thời', type:'Thị trấn', icon:'⛵', temp:30, hi:33, lo:25, rain:68, humidity:85, wind:22, aqi:43, desc:'Gió mạnh', features:['Cảng cá lớn nhất Cà Mau','Ngư nghiệp'], alert:'Gió mạnh', note:'Cảng cá Sông Đốc - lớn nhất Cà Mau. Gió mạnh thường xuyên, cần chú ý khi ra khơi.' },
  { id:32, name:'Khánh Bình',      district:'Trần Văn Thời', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:69, humidity:82, wind:16, aqi:47, desc:'Có mây',   features:['Nông nghiệp','Kênh nội đồng'],              alert:null, note:'Vùng nông nghiệp ổn định. Có nhiều kênh thủy lợi phục vụ sản xuất.' },
  { id:33, name:'Khánh Hải',       district:'Trần Văn Thời', type:'Xã',       icon:'🌊', temp:30, hi:33, lo:25, rain:72, humidity:86, wind:18, aqi:42, desc:'Mưa nhẹ',  features:['Ven biển Tây','Ngư nghiệp'],                alert:'Sóng lớn', note:'Giáp biển Tây. Mùa gió chướng (Đông Bắc) sóng lớn, tàu thuyền cần cẩn thận.' },
  { id:34, name:'Phong Điền',      district:'Trần Văn Thời', type:'Xã',       icon:'🌿', temp:31, hi:34, lo:26, rain:67, humidity:81, wind:17, aqi:48, desc:'Ít mây',   features:['Vùng lúa','Nông thôn mới'],                 alert:null, note:'Vùng lúa trù phú. Ít mưa hơn trung bình, thuận lợi cho thu hoạch.' },
  { id:35, name:'Lợi An',          district:'Trần Văn Thời', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:68, humidity:82, wind:16, aqi:47, desc:'Có mây',   features:['Lúa - rau màu','Phát triển'],               alert:null, note:'Đang phát triển mô hình rau màu an toàn. Thời tiết mùa khô rất thuận lợi.' },
  { id:36, name:'Trần Hợi',        district:'Trần Văn Thời', type:'Xã',       icon:'🌳', temp:30, hi:33, lo:25, rain:74, humidity:85, wind:15, aqi:43, desc:'Mưa nhẹ',  features:['Rừng tràm','Vùng đệm'],                     alert:null, note:'Vùng đệm giữa rừng và nông nghiệp. Độ ẩm cao quanh năm do rừng tràm lân cận.' },
  { id:37, name:'Phong Lạc',       district:'Trần Văn Thời', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:66, humidity:80, wind:18, aqi:49, desc:'Nắng nhẹ', features:['Lúa nước','Phong điện'],                    alert:null, note:'Có tiềm năng phát triển điện gió ven biển. Gió mạnh quanh năm.' },
  { id:38, name:'Đất Mũi',         district:'Ngọc Hiển',    type:'Xã',       icon:'🌊', temp:29, hi:32, lo:24, rain:88, humidity:93, wind:24, aqi:32, desc:'Mưa dông', features:['Mũi Cà Mau','Điểm cực Nam','Rừng ngập mặn'], alert:'Sóng to - Gió mạnh', note:'Mũi Cà Mau - điểm cực Nam Tổ quốc! Thời tiết khắc nghiệt, gió mạnh, sóng lớn. Khách tham quan cần theo dõi dự báo.' },
  { id:39, name:'Nguyễn Huân',     district:'Trần Văn Thời', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:73, humidity:86, wind:15, aqi:41, desc:'Có mây',   features:['Đất mặn','Nuôi tôm'],                       alert:null, note:'Vùng nuôi tôm sú truyền thống. Độ mặn cao, chú ý tưới tiêu mùa khô.' },

  // HUYỆN CÁI NƯỚC (8 xã + 1 thị trấn)
  { id:40, name:'TT. Cái Nước',    district:'Cái Nước', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:71, humidity:84, wind:16, aqi:45, desc:'Có mây',   features:['Trung tâm huyện','Cảng nhỏ'],               alert:null, note:'Trung tâm thương mại miền Tây Cà Mau. Chợ Cái Nước sầm uất, giao thông thủy bộ thuận tiện.' },
  { id:41, name:'Thạnh Phú',       district:'Cái Nước', type:'Xã',       icon:'🌾', temp:30, hi:33, lo:25, rain:74, humidity:86, wind:14, aqi:42, desc:'Mưa nhẹ',  features:['Tôm quảng canh','Kênh mương'],               alert:null, note:'Vùng tôm quảng canh cải tiến. Phụ thuộc nhiều vào thời tiết tự nhiên.' },
  { id:42, name:'Tân Hưng Đông',   district:'Cái Nước', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:75, humidity:87, wind:13, aqi:41, desc:'Mưa rào',  features:['Lúa - tôm','Vùng sâu'],                    alert:null, note:'Vùng sâu, ít tiếp cận dịch vụ đô thị. Tự cung tự cấp lương thực tốt.' },
  { id:43, name:'Trần Thới',       district:'Cái Nước', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:70, humidity:83, wind:16, aqi:44, desc:'Ít mây',   features:['Thủy sản','Nông thôn mới'],                 alert:null, note:'Đạt chuẩn nông thôn mới. Hạ tầng giao thông cải thiện, ít ngập đường bộ.' },
  { id:44, name:'Đông Thới',       district:'Cái Nước', type:'Xã',       icon:'🌊', temp:30, hi:33, lo:25, rain:76, humidity:87, wind:15, aqi:40, desc:'Mưa nhẹ',  features:['Ven sông Bảy Háp','Nuôi nghêu'],            alert:null, note:'Ven sông Bảy Háp. Nghề nuôi nghêu, sò huyết phát triển mạnh.' },
  { id:45, name:'Lương Thế Trân',  district:'Cái Nước', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:77, humidity:88, wind:14, aqi:39, desc:'Mưa rào',  features:['Rừng phòng hộ','Ven biển'],                 alert:null, note:'Có rừng phòng hộ ven biển. Không khí trong lành, ít ô nhiễm.' },
  { id:46, name:'Phú Hưng',        district:'Cái Nước', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:69, humidity:83, wind:16, aqi:45, desc:'Có mây',   features:['Nông nghiệp','Phát triển'],                 alert:null, note:'Xã phát triển nhanh. Đường bê-tông hoá nhiều, ít bị ngập khi mưa.' },
  { id:47, name:'Hưng Mỹ',         district:'Cái Nước', type:'Xã',       icon:'🌳', temp:30, hi:33, lo:25, rain:73, humidity:85, wind:15, aqi:42, desc:'Mưa nhẹ',  features:['Lúa nước','Vườn cây'],                      alert:null, note:'Xã trồng lúa nước xen kẽ vườn cây ăn trái. Nhiều bóng mát, mát mẻ hơn trung bình 1°C.' },
  { id:48, name:'Tân Hưng',        district:'Cái Nước', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:71, humidity:84, wind:15, aqi:43, desc:'Có mây',   features:['Kênh Tắc Thủ','Thủy sản'],                  alert:null, note:'Tiếp giáp kênh Tắc Thủ. Nuôi cá lồng bè và thủy sản nước lợ phổ biến.' },

  // HUYỆN ĐẦM DƠI (9 xã + 1 thị trấn)
  { id:49, name:'TT. Đầm Dơi',     district:'Đầm Dơi', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:68, humidity:82, wind:17, aqi:46, desc:'Nắng nhẹ', features:['Trung tâm huyện','Cảng thủy sản'],          alert:null, note:'Trung tâm kinh tế huyện Đầm Dơi. Cảng thủy sản xuất khẩu lớn.' },
  { id:50, name:'Tân Dân',          district:'Đầm Dơi', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:67, humidity:81, wind:18, aqi:47, desc:'Ít mây',   features:['Tôm công nghiệp','Xuất khẩu'],               alert:null, note:'Vùng tôm công nghiệp lớn. Ít mưa mùa khô, cần chú ý cung cấp nước ngọt.' },
  { id:51, name:'Quách Phẩm',       district:'Đầm Dơi', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:72, humidity:85, wind:15, aqi:43, desc:'Có mây',   features:['Nông nghiệp','Vùng trũng'],                 alert:null, note:'Vùng trũng thấp. Mùa mưa thường xuyên bị ngập nhẹ.' },
  { id:52, name:'Quách Phẩm Bắc',   district:'Đầm Dơi', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:69, humidity:82, wind:16, aqi:45, desc:'Có mây',   features:['Tôm sú','Kênh chính'],                      alert:null, note:'Có hệ thống kênh dẫn nước tốt. Nuôi tôm sú năng suất cao.' },
  { id:53, name:'Tạ An Khương',     district:'Đầm Dơi', type:'Xã',       icon:'🌊', temp:30, hi:33, lo:25, rain:74, humidity:86, wind:16, aqi:41, desc:'Mưa nhẹ',  features:['Ven biển','Nuôi nghêu'],                    alert:null, note:'Ven biển Đông. Nghề nuôi nghêu, sò huyết phát triển.' },
  { id:54, name:'Tạ An Khương Nam', district:'Đầm Dơi', type:'Xã',       icon:'🌊', temp:30, hi:33, lo:25, rain:75, humidity:87, wind:17, aqi:40, desc:'Mưa rào',  features:['Rừng ngập mặn','Ven biển Đông'],            alert:null, note:'Rừng ngập mặn dày đặc ven biển Đông. Chắn sóng hiệu quả, bảo vệ đất liền.' },
  { id:55, name:'Nguyễn Huân',      district:'Đầm Dơi', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:73, humidity:86, wind:15, aqi:42, desc:'Có mây',   features:['Lúa tôm','Vùng ven'],                       alert:null, note:'Mô hình lúa-tôm bền vững. Thời tiết đều hòa, ít thiên tai cực đoan.' },
  { id:56, name:'Thanh Tùng',       district:'Đầm Dơi', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:66, humidity:80, wind:18, aqi:47, desc:'Nắng nhẹ', features:['Gió mạnh','Tiềm năng phong điện'],          alert:null, note:'Vùng ven biển gió mạnh. Đang nghiên cứu phát triển điện gió.' },
  { id:57, name:'Ngọc Chánh',       district:'Đầm Dơi', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:72, humidity:85, wind:15, aqi:42, desc:'Mưa nhẹ',  features:['Nông nghiệp','Kênh Đầm Dơi'],               alert:null, note:'Địa hình bằng phẳng, nhiều kênh đào. Sản xuất thủy sản quy mô lớn.' },
  { id:58, name:'Tân Trung',        district:'Đầm Dơi', type:'Xã',       icon:'🌾', temp:31, hi:34, lo:26, rain:68, humidity:82, wind:16, aqi:44, desc:'Có mây',   features:['Tôm','Lúa','Cá nước ngọt'],                 alert:null, note:'Đa dạng mô hình sản xuất. Có ao nuôi cá nước ngọt trong vùng ngọt hóa.' },

  // HUYỆN NĂM CĂN (7 xã + 1 thị trấn)
  { id:59, name:'TT. Năm Căn',     district:'Năm Căn', type:'Thị trấn', icon:'🏘️', temp:30, hi:33, lo:25, rain:80, humidity:89, wind:18, aqi:38, desc:'Mưa rào',  features:['Cảng Năm Căn','Xuất khẩu tôm'],             alert:null, note:'Cảng Năm Căn - đầu mối xuất khẩu tôm quan trọng. Gần rừng ngập mặn, ẩm ướt quanh năm.' },
  { id:60, name:'Hàm Rồng',        district:'Năm Căn', type:'Xã',       icon:'🌿', temp:29, hi:32, lo:24, rain:85, humidity:92, wind:16, aqi:34, desc:'Mưa nhiều', features:['Rừng ngập mặn','Sinh thái'],                alert:null, note:'Vùng rừng ngập mặn dày đặc. Đa dạng sinh học phong phú, không khí trong lành.' },
  { id:61, name:'Đất Mới',         district:'Năm Căn', type:'Xã',       icon:'🌊', temp:29, hi:32, lo:24, rain:87, humidity:93, wind:19, aqi:33, desc:'Mưa dông', features:['Cửa sông lớn','Rừng mắm'],                  alert:'Sóng lớn', note:'Vùng cửa sông ven biển. Thường xuyên chịu sóng lớn và gió mạnh từ biển Đông.' },
  { id:62, name:'Lâm Hải',         district:'Năm Căn', type:'Xã',       icon:'🌲', temp:29, hi:32, lo:24, rain:86, humidity:92, wind:17, aqi:34, desc:'Mưa rào',  features:['Nuôi tôm rừng','Hữu cơ'],                   alert:null, note:'Nổi tiếng với mô hình tôm-rừng hữu cơ. Hệ sinh thái rừng - biển nguyên sinh.' },
  { id:63, name:'Hàng Vịnh',       district:'Năm Căn', type:'Xã',       icon:'🌊', temp:29, hi:32, lo:24, rain:84, humidity:91, wind:18, aqi:35, desc:'Mưa nhẹ',  features:['Rừng đước','Cua biển'],                     alert:null, note:'Nổi tiếng cua biển Năm Căn. Rừng đước nguyên sinh giúp điều hòa khí hậu.' },
  { id:64, name:'Tam Giang',       district:'Năm Căn', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:83, humidity:90, wind:16, aqi:36, desc:'Có mây',   features:['Ngã ba sông','Đánh bắt'],                   alert:null, note:'Ngã ba sông quan trọng. Nghề cá và khai thác thủy sản tự nhiên phát triển.' },
  { id:65, name:'Tam Giang Đông',  district:'Năm Căn', type:'Xã',       icon:'🌳', temp:29, hi:32, lo:24, rain:85, humidity:92, wind:17, aqi:33, desc:'Mưa rào',  features:['Rừng ngập mặn','Vùng lõi sinh thái'],       alert:null, note:'Vùng lõi sinh thái rừng ngập mặn Năm Căn. Được bảo vệ nghiêm ngặt.' },

  // HUYỆN PHÚ TÂN (5 xã + 1 thị trấn)
  { id:66, name:'TT. Cái Đôi Vàm', district:'Phú Tân', type:'Thị trấn', icon:'⛵', temp:30, hi:33, lo:25, rain:76, humidity:88, wind:20, aqi:39, desc:'Gió mạnh', features:['Cảng biển','Nghề biển truyền thống'],       alert:'Gió mạnh', note:'Cảng cá ven biển Tây. Gió mạnh thường xuyên, đặc biệt mùa gió chướng tháng 11-2.' },
  { id:67, name:'Phú Tân',         district:'Phú Tân', type:'Xã',       icon:'🌊', temp:30, hi:33, lo:25, rain:78, humidity:89, wind:19, aqi:37, desc:'Mưa nhẹ',  features:['Ven biển Tây','Nuôi nghêu'],                alert:null, note:'Vùng ven biển phía Tây. Bãi nghêu tự nhiên dài và phong phú.' },
  { id:68, name:'Tân Hải',         district:'Phú Tân', type:'Xã',       icon:'🌊', temp:30, hi:33, lo:25, rain:79, humidity:89, wind:20, aqi:36, desc:'Mưa rào',  features:['Rừng phòng hộ biển Tây','Gió mạnh'],        alert:'Gió cấp 5-6', note:'Rừng phòng hộ ven biển Tây đang bị xói lở. Gió mạnh nguy hiểm cho tàu nhỏ.' },
  { id:69, name:'Việt Thắng',      district:'Phú Tân', type:'Xã',       icon:'🌿', temp:30, hi:33, lo:25, rain:77, humidity:88, wind:18, aqi:38, desc:'Có mây',   features:['Nông nghiệp','Ven biển'],                   alert:null, note:'Xã ven biển với dải rừng phòng hộ. Sản xuất muối truyền thống mùa khô.' },
  { id:70, name:'Rạch Chèo',       district:'Phú Tân', type:'Xã',       icon:'🌾', temp:30, hi:33, lo:25, rain:75, humidity:87, wind:17, aqi:40, desc:'Mưa nhẹ',  features:['Thủy sản','Kênh rạch'],                     alert:null, note:'Mạng lưới kênh rạch dày đặc. Đi lại bằng xuồng rất phổ biến.' },
  { id:71, name:'Phú Mỹ',          district:'Phú Tân', type:'Xã',       icon:'🌳', temp:30, hi:33, lo:25, rain:76, humidity:87, wind:16, aqi:40, desc:'Có mây',   features:['Vùng sâu','Lúa tôm'],                       alert:null, note:'Vùng sâu huyện Phú Tân. Điều kiện thời tiết thuận lợi cho lúa - tôm xen canh.' },

  // HUYỆN NGỌC HIỂN (5 xã + 1 thị trấn)
  { id:72, name:'TT. Rạch Gốc',   district:'Ngọc Hiển', type:'Thị trấn', icon:'⛵', temp:29, hi:32, lo:24, rain:87, humidity:93, wind:22, aqi:31, desc:'Mưa dông', features:['Cảng Rạch Gốc','Cực Nam đất liền'],        alert:'Sóng to', note:'Cảng tàu cực Nam Cà Mau. Gần mũi đất, thời tiết thường xuyên phức tạp.' },
  { id:73, name:'Tân Ân Tây',     district:'Ngọc Hiển', type:'Xã',       icon:'🌊', temp:29, hi:32, lo:24, rain:88, humidity:93, wind:23, aqi:31, desc:'Gió mạnh', features:['Ven biển','Rừng ngập mặn'],                 alert:'Sóng lớn - Gió mạnh', note:'Vùng cực Nam tiếp giáp biển Đông và biển Tây. Thời tiết luôn biến động mạnh.' },
  { id:74, name:'Tân Ân',         district:'Ngọc Hiển', type:'Xã',       icon:'🌲', temp:29, hi:32, lo:24, rain:86, humidity:92, wind:21, aqi:32, desc:'Mưa rào',  features:['Rừng U Minh Hạ (phần)','Sinh thái'],        alert:null, note:'Phần phía Nam rừng ngập mặn U Minh Hạ. Đa dạng sinh học rất phong phú.' },
  { id:75, name:'Viên An Đông',   district:'Ngọc Hiển', type:'Xã',       icon:'🌊', temp:29, hi:32, lo:24, rain:87, humidity:93, wind:22, aqi:31, desc:'Mưa dông', features:['Cửa sông Bảy Háp','Ngư nghiệp'],            alert:'Sóng lớn', note:'Cửa sông Bảy Háp đổ ra biển. Dòng chảy mạnh, nguy hiểm cho tàu nhỏ.' },
  { id:76, name:'Viên An',        district:'Ngọc Hiển', type:'Xã',       icon:'🌿', temp:29, hi:32, lo:24, rain:85, humidity:92, wind:20, aqi:33, desc:'Mưa rào',  features:['Rừng đước','Nuôi tôm rừng'],                alert:null, note:'Rừng đước hàng chục năm tuổi. Mô hình tôm-rừng sinh thái bền vững.' },

  // ── BẠC LIÊU (CŨ) - 71 ĐỊA ĐIỂM ──
  // TP. BẠC LIÊU (4 phường + 4 xã)
  { id:77, name:'Phường 1', district:'Bạc Liêu (cũ)', type:'Phường', icon:'🌆', temp:32, hi:35, lo:27, rain:68, humidity:84, wind:17, aqi:48, desc:'Mưa rào', features:['Trung tâm TP','Hành chính'], alert:null, note:'Trung tâm hành chính Bạc Liêu cũ. Giao thông sầm uất.' },
  { id:78, name:'Phường 2', district:'Bạc Liêu (cũ)', type:'Phường', icon:'🏙️', temp:33, hi:36, lo:27, rain:62, humidity:81, wind:16, aqi:50, desc:'Có mây', features:['Chợ trung tâm','Thương mại'], alert:null, note:'Khu thương mại nhộn nhịp. Độ ẩm cao mùa mưa.' },
  { id:79, name:'Phường 3', district:'Bạc Liêu (cũ)', type:'Phường', icon:'🌆', temp:31, hi:34, lo:26, rain:75, humidity:86, wind:15, aqi:46, desc:'Mưa nhẹ', features:['Khu dân cư','Nhà thờ'], alert:null, note:'Gần nhà thờ Bạc Liêu. Mưa chiều thường xuyên.' },
  { id:80, name:'Phường 4', district:'Bạc Liêu (cũ)', type:'Phường', icon:'🏙️', temp:32, hi:35, lo:26, rain:70, humidity:83, wind:18, aqi:49, desc:'Có mây', features:['Bến xe','Giao thông'], alert:null, note:'Khu giao thông quan trọng. Chú ý kẹt xe giờ cao điểm.' },
  { id:81, name:'Nhà Bàng', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌳', temp:30, hi:33, lo:25, rain:78, humidity:88, wind:14, aqi:42, desc:'Mưa rào', features:['Nông nghiệp','Vườn cây'], alert:null, note:'Vùng ngoại ô với vườn cây ăn trái. Không khí mát mẻ.' },
  { id:82, name:'Vĩnh Trinh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:80, humidity:89, wind:13, aqi:40, desc:'Mưa nhẹ', features:['Lúa nước','Thuỷ sản'], alert:null, note:'Vùng lúa - tôm. Thời tiết ảnh hưởng vụ mùa.' },
  { id:83, name:'Vĩnh Mỹ', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:72, humidity:85, wind:16, aqi:45, desc:'Có mây', features:['Kênh rạch','Nuôi cá'], alert:null, note:'Nhiều kênh rạch, nghề cá phát triển.' },
  { id:84, name:'Hiệp Thành', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:76, humidity:87, wind:15, aqi:43, desc:'Mưa rào', features:['Nông thôn mới','Lúa chất lượng'], alert:null, note:'Đạt chuẩn nông thôn mới. Lúa thơm đặc sản.' },

  // H. HÒA BÌNH (10 xã)
  { id:85, name:'Vĩnh Hậu A', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:70, humidity:83, wind:16, aqi:47, desc:'Ít mây', features:['Lúa cao sản','Thủy lợi'], alert:null, note:'Vùng lúa cao sản. Hệ thống thủy lợi tốt.' },
  { id:86, name:'Vĩnh Hậu B', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:74, humidity:86, wind:14, aqi:44, desc:'Có mây', features:['Tôm sú','Đất phèn'], alert:null, note:'Mô hình tôm sú đất phèn. Cần rửa phèn mùa mưa.' },
  { id:87, name:'Vĩnh Mỹ B', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:30, hi:33, lo:25, rain:77, humidity:88, wind:17, aqi:41, desc:'Mưa nhẹ', features:['Ven biển','Ngư nghiệp'], alert:null, note:'Xã ven biển. Nghề đánh bắt phát triển.' },
  { id:88, name:'Hoà Mỹ', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌳', temp:29, hi:32, lo:24, rain:82, humidity:90, wind:15, aqi:39, desc:'Mưa rào', features:['Rừng phòng hộ','Sinh thái'], alert:null, note:'Rừng phòng hộ ven biển. Không khí trong lành.' },
  { id:89, name:'Lê Thị Riêng', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:68, humidity:82, wind:18, aqi:48, desc:'Nắng nhẹ', features:['Lúa - tôm','Nông thôn mới'], alert:null, note:'Đạt chuẩn nông thôn mới nâng cao.' },
  { id:90, name:'Hòa Minh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:75, humidity:87, wind:16, aqi:42, desc:'Có mây', features:['Vườn cây','Trái cây'], alert:null, note:'Chuyên canh cây ăn trái nhiệt đới.' },
  { id:91, name:'Hòa An', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:71, humidity:84, wind:15, aqi:46, desc:'Ít mây', features:['Lúa chất lượng cao','Cơ giới hóa'], alert:null, note:'Áp dụng cơ giới hóa khâu đồng áng.' },
  { id:92, name:'Vĩnh Mỹ A', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:30, hi:33, lo:25, rain:79, humidity:89, wind:19, aqi:38, desc:'Gió mạnh', features:['Cảng cá nhỏ','Đánh bắt'], alert:null, note:'Cảng cá địa phương. Gió biển mạnh mùa chướng.' },
  { id:93, name:'Hòa Thạnh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:73, humidity:85, wind:14, aqi:45, desc:'Mưa nhẹ', features:['Tôm thẻ chân trắng','Công nghiệp'], alert:null, note:'Vùng nuôi tôm thẻ chân trắng xuất khẩu.' },
  { id:94, name:'Hòa Phú', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌳', temp:29, hi:32, lo:24, rain:81, humidity:91, wind:13, aqi:40, desc:'Mưa rào', features:['Rừng tràm','Mía đường'], alert:null, note:'Trồng mía đường, rừng tràm phòng hộ.' },

  // H. HỒNG DÂN (10 xã)
  { id:95, name:'Hồng Dân', district:'Bạc Liêu (cũ)', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:69, humidity:82, wind:17, aqi:49, desc:'Có mây', features:['Trung tâm huyện','Chợ Hồng Dân'], alert:null, note:'Trung tâm thương mại huyện Hồng Dân.' },
  { id:96, name:'Ninh Quới A', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:32, hi:35, lo:27, rain:65, humidity:80, wind:18, aqi:51, desc:'Nắng nhẹ', features:['Lúa giống mới','Thu hoạch 3 vụ'], alert:null, note:'Vùng lúa năng suất cao nhất tỉnh.' },
  { id:97, name:'Ninh Quới Trung', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:74, humidity:86, wind:15, aqi:44, desc:'Mưa nhẹ', features:['Lúa - tôm luân canh','Đất phèn ngọt'], alert:null, note:'Mô hình luân canh hiệu quả trên đất phèn.' },
  { id:98, name:'Ninh Quới B', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:70, humidity:83, wind:16, aqi:47, desc:'Có mây', features:['Cơ giới hóa','Lúa chất lượng'], alert:null, note:'Cơ giới hóa đồng áng tiên tiến.' },
  { id:99, name:'Thạnh Lộc', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:77, humidity:88, wind:14, aqi:41, desc:'Mưa rào', features:['Tôm sú quảng canh','Kênh nội đồng'], alert:null, note:'Nuôi tôm quảng canh truyền thống.' },
  { id:100, name:'Thới Hậu B', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:68, humidity:81, wind:17, aqi:48, desc:'Ít mây', features:['Lúa mùa','Hè thu'], alert:null, note:'Vụ lúa hè thu năng suất cao.' },
  { id:101, name:'Thới Hậu A', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:72, humidity:85, wind:15, aqi:45, desc:'Có mây', features:['Nuôi cá lồng','Sông Hậu'], alert:null, note:'Ven sông Hậu, nuôi cá lồng bè.' },
  { id:102, name:'Linh Hải', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:30, hi:33, lo:25, rain:80, humidity:90, wind:20, aqi:39, desc:'Gió mạnh', features:['Ven biển','Rừng đước'], alert:null, note:'Rừng đước phòng hộ ven biển Đông.' },
  { id:103, name:'Đại Giã', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:66, humidity:79, wind:19, aqi:52, desc:'Nắng nóng', features:['Muối biển','Sản xuất muối'], alert:null, note:'Làng nghề làm muối truyền thống.' },
  { id:104, name:'Phong Thạnh Tây', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:75, humidity:87, wind:16, aqi:43, desc:'Mưa nhẹ', features:['Lúa - tôm','Đất phèn'], alert:null, note:'Cải tạo đất phèn hiệu quả.' },

  // H. PHƯỚC LONG (8 xã)
  { id:105, name:'Hưng Phước', district:'Bạc Liêu (cũ)', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:71, humidity:84, wind:15, aqi:46, desc:'Có mây', features:['Trung tâm huyện','Thương mại'], alert:null, note:'Trung tâm kinh tế Phước Long.' },
  { id:106, name:'Hưng Mỹ', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:32, hi:35, lo:27, rain:67, humidity:82, wind:17, aqi:50, desc:'Ít mây', features:['Lúa chất lượng','Xuất khẩu gạo'], alert:null, note:'Gạo đặc sản Phước Long.' },
  { id:107, name:'Hưng Thanh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:76, humidity:88, wind:14, aqi:42, desc:'Mưa rào', features:['Tôm thẻ','Công nghệ cao'], alert:null, note:'Nuôi tôm công nghệ cao.' },
  { id:108, name:'Phước Long', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:69, humidity:83, wind:16, aqi:47, desc:'Có mây', features:['Lúa - rau màu','Đa dạng'], alert:null, note:'Trồng rau màu xen lúa.' },
  { id:109, name:'Nông Trường Việt Thắng', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌳', temp:30, hi:33, lo:25, rain:74, humidity:86, wind:15, aqi:44, desc:'Mưa nhẹ', features:['Nông trường','Cây ăn trái'], alert:null, note:'Nông trường quốc doanh lớn.' },
  { id:110, name:'Vĩnh Phú Đông', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:78, humidity:89, wind:13, aqi:40, desc:'Mưa rào', features:['Lúa sinh thái','Hữu cơ'], alert:null, note:'Lúa hữu cơ sinh thái.' },
  { id:111, name:'Vĩnh Phú Tây', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:70, humidity:82, wind:18, aqi:48, desc:'Nắng nhẹ', features:['Cơ giới hóa','Thu hoạch máy'], alert:null, note:'Thu hoạch bằng máy kết hợp.' },
  { id:112, name:'Vĩnh Châu A', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:30, hi:33, lo:25, rain:82, humidity:91, wind:21, aqi:37, desc:'Gió mạnh', features:['Cảng cá Vĩnh Châu','Ngư dân'], alert:null, note:'Thủ phủ tôm hùm Vĩnh Châu.' },

  // H. VĨNH LỢI (9 xã)
  { id:113, name:'Vĩnh Lợi', district:'Bạc Liêu (cũ)', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:72, humidity:85, wind:16, aqi:45, desc:'Có mây', features:['Trung tâm huyện','Cầu Vĩnh Lợi'], alert:null, note:'Cầu Vĩnh Lợi nối đôi bờ sông Hậu.' },
  { id:114, name:'Vĩnh Hậu', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:32, hi:35, lo:27, rain:65, humidity:80, wind:19, aqi:52, desc:'Nắng nóng', features:['Lúa năng suất cao','3 vụ/năm'], alert:null, note:'Vùng lúa 3 vụ/năm.' },
  { id:115, name:'Vĩnh Trinh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:75, humidity:87, wind:15, aqi:43, desc:'Mưa nhẹ', features:['Tôm sú chất lượng','Xuất khẩu'], alert:null, note:'Tôm sú thương hiệu Vĩnh Lợi.' },
  { id:116, name:'Vĩnh Châu B', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:29, hi:32, lo:24, rain:84, humidity:92, wind:22, aqi:35, desc:'Mưa dông', features:['Tôm hùm lồng bè','Biển Đông'], alert:null, note:'Nuôi tôm hùm nổi tiếng.' },
  { id:117, name:'Hậu Thạnh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:68, humidity:81, wind:17, aqi:49, desc:'Ít mây', features:['Lúa giống mới','Bảo tồn gen'], alert:null, note:'Bảo tồn giống lúa địa phương.' },
  { id:118, name:'Tân Thạnh Đông', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:77, humidity:88, wind:14, aqi:41, desc:'Mưa rào', features:['Cây cói','Làng nghề'], alert:null, note:'Làng nghề đan cói truyền thống.' },
  { id:119, name:'Tân Thạnh Tây', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:70, humidity:83, wind:16, aqi:47, desc:'Có mây', features:['Rau màu sạch','An toàn thực phẩm'], alert:null, note:'Trồng rau sạch VietGAP.' },
  { id:120, name:'Tân Hưng Tây', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:73, humidity:86, wind:15, aqi:44, desc:'Mưa nhẹ', features:['Nuôi cá nước ngọt','Ao hồ'], alert:null, note:'Hệ thống ao nuôi cá lớn.' },
  { id:121, name:'Long Thạnh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌳', temp:29, hi:32, lo:24, rain:80, humidity:89, wind:18, aqi:39, desc:'Mưa rào', features:['Vườn quốc gia','Sinh thái'], alert:null, note:'Gần Vườn chim Bạc Liêu.' },

  // H. ĐÔNG HẢI (8 xã + 1 TT)
  { id:122, name:'TT. Đông Hải', district:'Bạc Liêu (cũ)', type:'Thị trấn', icon:'🏘️', temp:30, hi:33, lo:25, rain:78, humidity:88, wind:19, aqi:40, desc:'Gió mạnh', features:['Trung tâm huyện','Cảng biển'], alert:null, note:'Cảng biển Đông Hải quan trọng.' },
  { id:123, name:'Hòa Đông', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:29, hi:32, lo:24, rain:85, humidity:92, wind:23, aqi:36, desc:'Mưa dông', features:['Đảo nhỏ','Ngư trường'], alert:'Sóng lớn', note:'Ngư trường lớn ngoài khơi.' },
  { id:124, name:'An Trạch', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:76, humidity:87, wind:17, aqi:42, desc:'Mưa nhẹ', features:['Tôm hùm cage','Lồng bè'], alert:null, note:'Nuôi tôm hùm lồng bè biển.' },
  { id:125, name:'An Trạch A', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:29, hi:32, lo:24, rain:83, humidity:91, wind:21, aqi:37, desc:'Gió mạnh', features:['Rừng phòng hộ biển','Xói lở'], alert:null, note:'Rừng chắn sóng, chống xói lở.' },
  { id:126, name:'Đông Hải 1', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:30, hi:33, lo:25, rain:74, humidity:86, wind:16, aqi:44, desc:'Có mây', features:['Muối biển','Nước mặn'], alert:null, note:'Sản xuất muối quy mô lớn.' },
  { id:127, name:'Đông Hải 2', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:29, hi:32, lo:24, rain:87, humidity:93, wind:24, aqi:33, desc:'Mưa to', features:['Cực Đông Nam Bộ','Điểm cực'], alert:null, note:'Gần Mũi Cà Mau - điểm cực Đông Nam Bộ.' },
  { id:128, name:'Hải Trạch', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:79, humidity:89, wind:20, aqi:38, desc:'Mưa rào', features:['Đảo Hòn Khoai','Sinh thái'], alert:null, note:'Tiếp cận đảo Hòn Khoai hoang sơ.' },
  { id:129, name:'Ngọc Hưng', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:70, humidity:83, wind:18, aqi:46, desc:'Nắng nhẹ', features:['Lúa nước mặn','Kháng mặn'], alert:null, note:'Lúa chịu mặn đặc sản.' },

  // H. GIÁ RAI (11 xã + 1 TT)
  { id:130, name:'TT. Giá Rai', district:'Bạc Liêu (cũ)', type:'Thị trấn', icon:'🏘️', temp:31, hi:34, lo:26, rain:73, humidity:85, wind:16, aqi:45, desc:'Có mây', features:['Trung tâm huyện','Chợ nổi'], alert:null, note:'Chợ nổi Giá Rai độc đáo.' },
  { id:131, name:'Hưng Hội', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:75, humidity:87, wind:15, aqi:43, desc:'Mưa nhẹ', features:['Đất phèn ngọt hóa','Lúa chất lượng'], alert:null, note:'Cải tạo đất phèn thành công.' },
  { id:132, name:'Hưng Phước', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:69, humidity:82, wind:17, aqi:48, desc:'Ít mây', features:['Lúa thơm','Giống mới'], alert:null, note:'Lúa thơm nếp đặc sản.' },
  { id:133, name:'Lộc Hưng', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:77, humidity:88, wind:14, aqi:41, desc:'Mưa rào', features:['Tôm sú xuất khẩu','Kỹ thuật mới'], alert:null, note:'Tôm sú chất lượng cao.' },
  { id:134, name:'Phong Lập', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:71, humidity:84, wind:16, aqi:47, desc:'Có mây', features:['Rau màu công nghiệp','Xuất khẩu'], alert:null, note:'Rau xuất khẩu châu Âu.' },
  { id:135, name:'Phong Thạnh Đông', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:74, humidity:86, wind:15, aqi:44, desc:'Mưa nhẹ', features:['Cây cói dệt','Làng nghề'], alert:null, note:'Làng nghề đan lát cói.' },
  { id:136, name:'Tân Phong', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:68, humidity:81, wind:18, aqi:49, desc:'Nắng nhẹ', features:['Lúa thu hoạch sớm','Đông xuân'], alert:null, note:'Vụ lúa Đông Xuân năng suất cao.' },
  { id:137, name:'Tân Thạnh', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌿', temp:30, hi:33, lo:25, rain:76, humidity:87, wind:14, aqi:42, desc:'Mưa rào', features:['Nuôi cá tra','Công nghiệp'], alert:null, note:'Trang trại cá tra lớn.' },
  { id:138, name:'Vĩnh Lộc', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌳', temp:29, hi:32, lo:24, rain:81, humidity:90, wind:16, aqi:40, desc:'Mưa to', features:['Rừng tràm','Mía đường'], alert:null, note:'Trồng mía đường quy mô.' },
  { id:139, name:'Vĩnh Hưng', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌾', temp:31, hi:34, lo:26, rain:70, humidity:83, wind:17, aqi:46, desc:'Có mây', features:['Lúa - vịt','Kết hợp'], alert:null, note:'Mô hình lúa - vịt hiệu quả.' },
  { id:140, name:'Biển Hưng', district:'Bạc Liêu (cũ)', type:'Xã', icon:'🌊', temp:30, hi:33, lo:25, rain:82, humidity:91, wind:20, aqi:38, desc:'Gió mạnh', features:['Nuôi nghêu','Bãi biển'], alert:null, note:'Bãi nghêu tự nhiên dài km.' },
];


// ── 7-DAY FORECAST DATA ──
const FORECAST = [
  {d:'Hôm nay',    date:'27/03', icon:'🌦️', desc:'Mưa rào chiều tối', hi:33, lo:26, rain:70, humidity:82, wind:18, sunrise:'05:52', sunset:'18:34'},
  {d:'Thứ Bảy',   date:'28/03', icon:'🌧️', desc:'Mưa vừa - mưa to',  hi:31, lo:25, rain:85, humidity:88, wind:20, sunrise:'05:52', sunset:'18:33'},
  {d:'Chủ Nhật',  date:'29/03', icon:'⛈️', desc:'Dông buổi chiều',   hi:30, lo:25, rain:90, humidity:90, wind:22, sunrise:'05:51', sunset:'18:33'},
  {d:'Thứ Hai',   date:'30/03', icon:'☁️', desc:'Có mây, mưa nhẹ',   hi:32, lo:26, rain:55, humidity:84, wind:17, sunrise:'05:51', sunset:'18:32'},
  {d:'Thứ Ba',    date:'31/03', icon:'🌤️', desc:'Nhiều nắng buổi sáng',hi:34, lo:27, rain:30, humidity:79, wind:15, sunrise:'05:50', sunset:'18:32'},
  {d:'Thứ Tư',    date:'01/04', icon:'☀️', desc:'Nắng đẹp',           hi:36, lo:28, rain:10, humidity:75, wind:14, sunrise:'05:50', sunset:'18:31'},
  {d:'Thứ Năm',   date:'02/04', icon:'🌤️', desc:'Ít mây',             hi:35, lo:27, rain:20, humidity:77, wind:15, sunrise:'05:49', sunset:'18:31'},
];

// ── HOURLY DATA ──
const HOURS = [
  {t:'Bây giờ',icon:'🌦️',temp:32,rain:70},{t:'09:00',icon:'☁️',temp:33,rain:40},
  {t:'10:00',icon:'🌤️',temp:34,rain:20}, {t:'11:00',icon:'☀️',temp:35,rain:10},
  {t:'12:00',icon:'☀️',temp:36,rain:10}, {t:'13:00',icon:'🌤️',temp:36,rain:25},
  {t:'14:00',icon:'☁️',temp:35,rain:45}, {t:'15:00',icon:'🌦️',temp:34,rain:65},
  {t:'16:00',icon:'🌧️',temp:32,rain:80}, {t:'17:00',icon:'⛈️',temp:30,rain:85},
  {t:'18:00',icon:'🌦️',temp:29,rain:55}, {t:'19:00',icon:'🌙',temp:28,rain:30},
  {t:'20:00',icon:'🌙',temp:27,rain:20}, {t:'21:00',icon:'🌙',temp:27,rain:15},
  {t:'22:00',icon:'🌙',temp:26,rain:10}, {t:'23:00',icon:'🌙',temp:26,rain:8},
];

// ── HELPERS ──
const $ = id => document.getElementById(id);
const tempC2F = c => Math.round(c * 9/5 + 32);
const dispTemp = c => STATE.unit === 'C' ? c : tempC2F(c);
const unitSuffix = () => STATE.unit === 'C' ? '°C' : '°F';
function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── INIT STARS & CLOUDS ──
(function initSky() {
  const c = $('stars');
  for (let i = 0; i < 100; i++) {
    const s = document.createElement('div'); s.className = 'star';
    const sz = Math.random() * 2.5 + .5;
    s.style.cssText = `width:${sz}px;height:${sz}px;top:${Math.random()*60}%;left:${Math.random()*100}%;--d:${(Math.random()*4+2).toFixed(1)}s;animation-delay:${(Math.random()*4).toFixed(1)}s`;
    c.appendChild(s);
  }
  const cl = $('clouds');
  [{w:200,h:40,top:'8%',op:.6,dur:90},{w:130,h:28,top:'15%',op:.4,dur:70},{w:280,h:50,top:'20%',op:.3,dur:120},{w:160,h:35,top:'5%',op:.5,dur:80}].forEach(cfg => {
    const d = document.createElement('div'); d.className = 'cloud';
    d.style.cssText = `width:${cfg.w}px;height:${cfg.h}px;top:${cfg.top};left:-${cfg.w+50}px;opacity:${cfg.op};--cd:${cfg.dur}s;animation-delay:${Math.random()*-cfg.dur}s;`;
    ['top:-','left:'].forEach(() => {}); // blobs
    const b = document.createElement('div');
    b.style.cssText = `position:absolute;top:-${cfg.h*.4}px;left:${cfg.w*.2}px;width:${cfg.h*1.5}px;height:${cfg.h*1.5}px;border-radius:50%;background:rgba(255,255,255,0.09);filter:blur(1px)`;
    d.appendChild(b);
    cl.appendChild(d);
  });
  const hr = new Date().getHours();
  const isDay = hr >= 6 && hr < 18;
  if (!isDay) {
    $('mainOrb').style.background = 'radial-gradient(circle at 38% 35%,#e2e8f0 0%,#94a3b8 40%,#475569 80%,#1e293b 100%)';
    $('mainOrb').style.boxShadow = '0 0 40px 15px rgba(148,163,184,0.2)';
  }
})();

// ── UPDATE TIME ──
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  $('updateTime').textContent = `${hh}:${mm}`;
  $('footerTime') && ($('footerTime').textContent = `Cập nhật lúc ${hh}:${mm} · ${now.toLocaleDateString('vi-VN')}`);
}
updateClock();
setInterval(updateClock, 60000);

// ── RENDER HOURLY ──
function renderHourly() {
  const track = $('hourlyTrack'); track.innerHTML = '';
  HOURS.forEach((h, i) => {
    const d = document.createElement('div');
    d.className = 'hour-card' + (i === 0 ? ' active' : '');
    const t = dispTemp(h.temp);
    d.innerHTML = `<div class="hour-time">${h.t}</div>
      <span class="hour-icon">${h.icon}</span>
      <div class="hour-temp">${t}°</div>
      <div class="hour-rain">💧${h.rain}%</div>
      <div class="rain-bar"><div class="rain-fill" style="width:${h.rain}%"></div></div>`;
    track.appendChild(d);
  });
}

// ── RENDER FORECAST (HOME) ──
function renderForecastHome() {
  const fl = $('forecastList'); fl.innerHTML = '';
  const minT = 25, maxT = 36, range = maxT - minT;
  FORECAST.forEach((d, i) => {
    const lp = ((d.lo - minT) / range * 100).toFixed(0);
    const wp = (((d.hi - d.lo) / range) * 100).toFixed(0);
    const el = document.createElement('div'); el.className = 'forecast-card';
    el.innerHTML = `<div class="fc-day">${d.d}<div style="font-size:10px;color:var(--muted);font-weight:400;">${d.date}</div></div>
      <div class="fc-icon">${d.icon}</div>
      <div class="fc-desc">${d.desc}</div>
      <div class="fc-rain">💧${d.rain}%</div>
      <div class="fc-bar-wrap"><div class="fc-bar" style="left:${lp}%;width:${wp}%"></div></div>
      <div class="fc-temps"><span class="fc-hi">${dispTemp(d.hi)}°</span><span class="fc-lo">${dispTemp(d.lo)}°</span></div>`;
    fl.appendChild(el);
  });
}

// ── RENDER FORECAST FULL (7-day tab) ──
function renderForecastFull() {
  const fl = $('forecastFull'); if (!fl) return; fl.innerHTML = '';
  FORECAST.forEach((d, i) => {
    const card = document.createElement('div'); card.className = 'fc-full-card';
    card.innerHTML = `<div class="fc-full-head" onclick="this.nextElementSibling.classList.toggle('open')">
      <div class="fc-icon" style="font-size:28px;">${d.icon}</div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:15px;">${d.d} — ${d.date}</div>
        <div style="font-size:12px;color:var(--muted);">${d.desc}</div>
      </div>
      <div style="text-align:right;">
        <span class="fc-hi">${dispTemp(d.hi)}°</span>
        <span class="fc-lo" style="margin-left:6px;">${dispTemp(d.lo)}°</span>
      </div>
      <div style="margin-left:12px;color:var(--muted);font-size:14px;">▼</div>
    </div>
    <div class="fc-full-body">
      <div class="fc-detail-item"><div class="fc-detail-val">💧${d.rain}%</div><div class="fc-detail-lbl">Mưa</div></div>
      <div class="fc-detail-item"><div class="fc-detail-val">${d.humidity}%</div><div class="fc-detail-lbl">Độ ẩm</div></div>
      <div class="fc-detail-item"><div class="fc-detail-val">${d.wind} km/h</div><div class="fc-detail-lbl">Gió</div></div>
      <div class="fc-detail-item"><div class="fc-detail-val">🌅 ${d.sunrise}</div><div class="fc-detail-lbl">Bình minh</div></div>
      <div class="fc-detail-item"><div class="fc-detail-val">🌇 ${d.sunset}</div><div class="fc-detail-lbl">Hoàng hôn</div></div>
      <div class="fc-detail-item"><div class="fc-detail-val">${dispTemp(Math.round((d.hi+d.lo)/2))}°</div><div class="fc-detail-lbl">Trung bình</div></div>
    </div>`;
    fl.appendChild(card);
  });
}

// ── DASHBOARD FUNCTIONS ──
function computeDistrictStats() {
  const stats = {};
  WARDS.forEach(w => {
    if (!stats[w.district]) {
      stats[w.district] = {count: 0, temp: 0, rain: 0, humidity: 0, wind: 0, aqi: 0};
    }
    stats[w.district].count++;
    stats[w.district].temp += w.temp;
    stats[w.district].rain += w.rain;
    stats[w.district].humidity += w.humidity;
    stats[w.district].wind += w.wind;
    stats[w.district].aqi += w.aqi;
  });
  Object.keys(stats).forEach(d => {
    const s = stats[d];
    stats[d] = {
      avgTemp: Math.round(s.temp / s.count * 10) / 10,
      avgRain: Math.round(s.rain / s.count * 10) / 10,
      avgHumidity: Math.round(s.humidity / s.count * 10) / 10,
      avgWind: Math.round(s.wind / s.count * 10) / 10,
      avgAQI: Math.round(s.aqi / s.count * 10) / 10,
      count: s.count
    };
  });
  return stats;
}

function renderDistrictTable() {
  const stats = computeDistrictStats();
  const tbody = $('districtAvgTable').querySelector('tbody');
  tbody.innerHTML = '';
  Object.entries(stats).sort((a,b) => b[1].avgRain - a[1].avgRain).slice(0, 10).forEach(([district, data]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${district}</td>
      <td>${dispTemp(data.avgTemp)}°</td>
      <td>${data.avgRain}%</td>
      <td>${data.avgHumidity}%</td>
      <td>${data.avgWind} km/h</td>
      <td>${data.avgAQI}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTopRainTable() {
  const sorted = [...WARDS].sort((a,b) => b.rain - a.rain).slice(0,10);
  const tbody = $('topRainTable').querySelector('tbody');
  tbody.innerHTML = '';
  sorted.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${w.icon} ${w.name} (${w.district.slice(0,12)}...)</td>
      <td>${w.rain}%</td>
      <td>${dispTemp(w.temp)}°</td>
    `;
    tbody.appendChild(tr);
  });
}

async function fetchRealTime() {
  try {
    const resp = await fetch('http://localhost:5000/api/weather');
    if (resp.ok) {
      const data = await resp.json();
      return data.data || [];
    }
  } catch (e) {
    console.log('API error:', e);
  }
  return null;
}

function generateFarmerAdvice(cityData) {
  const advice = [];
  const t = cityData.temp;
  const r = cityData.rain;
  const h = cityData.humidity;
  const w = cityData.wind;
  
  if (r > 70) advice.push('❌ Tránh phun thuốc trừ sâu, bón phân hóa học');
  if (t > 32) advice.push('⚠️ Tôm cá kiểm tra oxy hòa tan, bật quạt');
  if (t < 25 && r > 50) advice.push('🌾 Lúa vụ Đông Xuân chú ý úng nước');
  if (w > 20) advice.push('🌴 Cây trái buộc chằng chống gió');
  if (h > 90) advice.push('🍄 Nấm bệnh dễ phát triển, thông thoáng vườn');
  
  return advice.length ? advice : ['✅ Thời tiết thuận lợi cho sản xuất nông nghiệp.'];
}

// Update hero with real-time (call on load/refresh)
async function updateRealTime() {
  const data = await fetchRealTime();
  if (data && data.length) {
    const caMau = data.find(d => d.city.includes('Ca Mau')) || data[0];
    $('heroCity').textContent = caMau.city;
    updateTempDisplay(caMau.temp, caMau.temp + 3, caMau.temp - 2);
    $('mainDesc').textContent = caMau.desc;
    $('sHumidity').textContent = caMau.humidity + '%';
    $('sWind').textContent = Math.round(caMau.wind) + ' km/h';
    $('feelsLike').textContent = `Real-time — Cảm giác ${caMau.feels}° | Updated ${caMau.updated}`;
    $('refreshBtn').textContent = '↻ Live';
    
    // Farmer advice section
    const adviceList = generateFarmerAdvice(caMau);
    let adviceHTML = '<div class="farmer-advice"><div class="section-title">👨‍🌾 Khuyến nghị nông dân</div><ul>';
    adviceList.forEach(a => adviceHTML += `<li>${a}</li>`);
    adviceHTML += '</ul></div>';
    const existing = $('farmerAdvice');
    if (existing) existing.outerHTML = adviceHTML;
    else $('heroLocation').insertAdjacentHTML('afterend', adviceHTML);
    
    showToast('📡 Dữ liệu real-time từ OpenWeatherMap');
  }
}

function renderRainDistrictChart() {
  const stats = computeDistrictStats();
  const canvas = $('rainDistrictChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth, H = 200;
  canvas.width = W * 2; canvas.height = H * 2; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(2,2);
  ctx.clearRect(0,0,W,H);
  
  const districts = Object.keys(stats).sort((a,b) => stats[b].avgRain - stats[a].avgRain).slice(0,8);
  const maxRain = Math.max(...districts.map(d => stats[d].avgRain));
  const barWidth = (W - 60) / districts.length;
  const barHeightScale = (H - 60) / maxRain;
  
  districts.forEach((d, i) => {
    const x = 30 + i * barWidth + 10;
    const height = stats[d].avgRain * barHeightScale;
    const barY = H - 40 - height;
    
    // Bar gradient
    const grad = ctx.createLinearGradient(x, barY, x, H - 40);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#1e40af');
    ctx.fillStyle = grad;
    ctx.fillRect(x, barY, barWidth - 12, height);
    
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, barY, barWidth - 12, height);
    
    // Label
    ctx.fillStyle = 'var(--text)';
    ctx.font = '11px Be Vietnam Pro';
    ctx.textAlign = 'center';
    ctx.fillText(d.slice(0,12) + '...', x + (barWidth-12)/2, H - 10);
    ctx.textAlign = 'right';
    ctx.fillText(`${stats[d].avgRain}%`, x + barWidth - 15, barY - 5);
  });
}

// ── RENDER TEMPERATURE CHART ──
function renderChart() {
  const canvas = $('tempChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 800, H = 120;
  canvas.width = W; canvas.height = H;
  const temps = HOURS.map(h => dispTemp(h.temp));
  const minV = Math.min(...temps) - 2, maxV = Math.max(...temps) + 2;
  const px = (i) => (i / (HOURS.length - 1)) * (W - 40) + 20;
  const py = (v) => H - 20 - ((v - minV) / (maxV - minV)) * (H - 35);
  ctx.clearRect(0, 0, W, H);
  // gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(56,189,248,0.3)');
  grad.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.beginPath();
  ctx.moveTo(px(0), py(temps[0]));
  for (let i = 1; i < temps.length; i++) {
    const cpx = (px(i - 1) + px(i)) / 2;
    ctx.bezierCurveTo(cpx, py(temps[i-1]), cpx, py(temps[i]), px(i), py(temps[i]));
  }
  ctx.lineTo(px(temps.length - 1), H);
  ctx.lineTo(px(0), H);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // line
  ctx.beginPath();
  ctx.moveTo(px(0), py(temps[0]));
  for (let i = 1; i < temps.length; i++) {
    const cpx = (px(i - 1) + px(i)) / 2;
    ctx.bezierCurveTo(cpx, py(temps[i-1]), cpx, py(temps[i]), px(i), py(temps[i]));
  }
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5; ctx.stroke();
  // dots + labels
  HOURS.forEach((h, i) => {
    const x = px(i), y = py(temps[i]);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#fb923c' : '#38bdf8'; ctx.fill();
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(200,220,255,0.7)';
      ctx.font = '10px Be Vietnam Pro, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${temps[i]}°`, x, y - 10);
    }
  });
}

// ── RENDER WARDS GRID ──
function renderWardsGrid(filter = 'all', search = '') {
  const grid = $('wardsGrid'); if (!grid) return;
  grid.innerHTML = '';
  const filtered = WARDS.filter(w => {
    const distOk = filter === 'all' || w.district === filter;
    const searchOk = !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.district.toLowerCase().includes(search.toLowerCase());
    return distOk && searchOk;
  });
  $('wardsCount') && ($('wardsCount').textContent = `Hiển thị ${filtered.length} / ${WARDS.length} địa phương`);
  filtered.forEach(w => {
    const card = document.createElement('div'); card.className = 'ward-card';
    card.innerHTML = `
      ${w.alert ? `<div class="wc-alert">⚠ ${w.alert}</div>` : ''}
      <div class="wc-type">${w.type}</div>
      <div class="wc-name">${w.name}</div>
      <div class="wc-dist">${w.district}</div>
      <div class="wc-weather">
        <div>
          <div class="wc-icon">${w.icon}</div>
          <div class="wc-rain">💧${w.rain}%</div>
        </div>
        <div>
          <div class="wc-temp">${dispTemp(w.temp)}°</div>
          <div class="wc-detail">${w.desc}<br/>↑${dispTemp(w.hi)}° ↓${dispTemp(w.lo)}°</div>
        </div>
      </div>`;
    card.addEventListener('click', () => openWardModal(w));
    grid.appendChild(card);
  });
  if (filtered.length === 0) grid.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);grid-column:1/-1;">Không tìm thấy địa phương nào</div>';
}

// ── OPEN WARD MODAL ──
function openWardModal(w) {
  $('wmName').textContent = `${w.icon} ${w.name}`;
  $('wmSub').textContent = `${w.type} — ${w.district}`;
  const hourData = HOURS.slice(0, 8);
  $('wmBody').innerHTML = `
    <div class="wm-stats">
      <div class="wm-stat"><span class="wm-sv">${dispTemp(w.temp)}°</span><span class="wm-sl">Nhiệt độ</span></div>
      <div class="wm-stat"><span class="wm-sv">${w.humidity}%</span><span class="wm-sl">Độ ẩm</span></div>
      <div class="wm-stat"><span class="wm-sv">${w.wind} km/h</span><span class="wm-sl">Tốc độ gió</span></div>
      <div class="wm-stat"><span class="wm-sv">${w.aqi}</span><span class="wm-sl">AQI</span></div>
      <div class="wm-stat"><span class="wm-sv">↑${dispTemp(w.hi)}°</span><span class="wm-sl">Cao nhất</span></div>
      <div class="wm-stat"><span class="wm-sv">↓${dispTemp(w.lo)}°</span><span class="wm-sl">Thấp nhất</span></div>
    </div>
    <div class="wm-hourly-title">Dự báo theo giờ</div>
    <div class="wm-hourly">
      ${hourData.map(h => `<div class="wm-hc">
        <div class="wm-htime">${h.t}</div>
        <span class="wm-hicon">${h.icon}</span>
        <div class="wm-htemp">${dispTemp(h.temp)}°</div>
        <div style="font-size:9px;color:#93c5fd;">💧${h.rain}%</div>
      </div>`).join('')}
    </div>
    ${w.alert ? `<div class="wm-alert">⚠️ <strong>Cảnh báo:</strong> ${w.alert} — Người dân và ngư dân cần chú ý đề phòng.</div>` : ''}
    <div class="wm-desc-box">
      <div style="font-size:11px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;">📝 Đặc điểm địa phương</div>
      <p>${w.note}</p>
    </div>
    <div class="wm-feature-row">
      ${w.features.map(f => `<span class="wm-feature">${f}</span>`).join('')}
    </div>
    <button onclick="selectWardFromModal(${w.id})" style="margin-top:14px;width:100%;background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.35);border-radius:12px;padding:12px;color:var(--accent);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
      📍 Xem thời tiết khu vực này
    </button>`;
  $('wardModal').classList.add('open');
}

window.selectWardFromModal = function(id) {
  const w = WARDS.find(x => x.id === id);
  if (!w) return;
  $('wardModal').classList.remove('open');
  selectWard(w);
  switchTab('home');
};

// ── SELECT WARD (update home screen) ──
function selectWard(w) {
  STATE.selectedWard = w;
  $('heroCity').textContent = w.name;
  $('heroProvince').textContent = `${w.type} — ${w.district}`;
  $('heroLocation').textContent = `📍 ${w.name} · ${w.district}`;
  $('currentLocSub').textContent = `${w.name}`;
  updateTempDisplay(w.temp, w.hi, w.lo);
  $('feelsLike').textContent = `${w.desc} — Cảm giác như ${dispTemp(w.temp + 2)}°${STATE.unit}`;
  $('sHumidity').textContent = w.humidity + '%';
  $('sWind').textContent = w.wind + ' km/h';
  $('mainIcon').textContent = w.icon;
  $('mainDesc').textContent = w.desc;
  showToast(`✅ Đã chọn: ${w.name}`);
}

function updateTempDisplay(temp, hi, lo) {
  $('currentTemp').innerHTML = `${dispTemp(temp)}<sup id="tempUnitLabel">${unitSuffix()}</sup>`;
  $('hiTemp').textContent = dispTemp(hi);
  $('loTemp').textContent = dispTemp(lo);
}

// ── RENDER SEARCH RESULTS (overlay) ──
function renderSearchResults(filter = 'all', query = '') {
  const list = $('searchResults'); list.innerHTML = '';
  const results = WARDS.filter(w => {
    const dOk = filter === 'all' || w.district === filter;
    const qOk = !query || w.name.toLowerCase().includes(query.toLowerCase()) || w.district.toLowerCase().includes(query.toLowerCase());
    return dOk && qOk;
  });
  if (results.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">Không tìm thấy địa phương nào</div>';
    return;
  }
  results.forEach(w => {
    const item = document.createElement('div'); item.className = 'sr-item';
    item.innerHTML = `<div class="sr-icon">${w.icon}</div>
      <div class="sr-info">
        <div class="sr-name">${w.name}</div>
        <div class="sr-dist">${w.type} — ${w.district}</div>
      </div>
      <div class="sr-weather">
        <span class="sr-temp">${dispTemp(w.temp)}°</span>
        <span class="sr-rain">💧${w.rain}%</span>
      </div>`;
    item.addEventListener('click', () => {
      selectWard(w);
      closeSearch();
    });
    list.appendChild(item);
  });
}

// ── SEARCH OVERLAY ──
function openSearch() { $('searchOverlay').classList.add('open'); $('searchInput').focus(); renderSearchResults('all', ''); }
function closeSearch() { $('searchOverlay').classList.remove('open'); }
$('searchBtn').addEventListener('click', openSearch);
$('searchClose').addEventListener('click', closeSearch);
$('searchOverlay').addEventListener('click', e => { if (e.target === $('searchOverlay')) closeSearch(); });

let searchD = 'all';
$('districtTabs').addEventListener('click', e => {
  const btn = e.target.closest('.dtab');
  if (!btn) return;
  document.querySelectorAll('.dtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  searchD = btn.dataset.d;
  renderSearchResults(searchD, $('searchInput').value);
});
$('searchInput').addEventListener('input', e => renderSearchResults(searchD, e.target.value));

// ── WARD MODAL CLOSE ──
$('wmClose').addEventListener('click', () => $('wardModal').classList.remove('open'));
$('wardModal').addEventListener('click', e => { if (e.target === $('wardModal')) $('wardModal').classList.remove('open'); });

// ── WARDS TAB FILTERS ──
let wardFilterD = 'all';
$('districtFilter') && $('districtFilter').addEventListener('click', e => {
  const btn = e.target.closest('.df-btn');
  if (!btn) return;
  document.querySelectorAll('.df-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  wardFilterD = btn.dataset.d;
  renderWardsGrid(wardFilterD, $('wardSearch') ? $('wardSearch').value : '');
});
$('wardSearch') && $('wardSearch').addEventListener('input', e => renderWardsGrid(wardFilterD, e.target.value));

// ── TAB SWITCHING ──
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn,.bn-item').forEach(b => b.classList.remove('active'));
  const content = $('tab-' + name);
  if (content) content.classList.add('active');
  document.querySelectorAll(`[data-tab="${name}"]`).forEach(b => b.classList.add('active'));
  if (name === 'forecast') renderForecastFull();
  if (name === 'wards') renderWardsGrid(wardFilterD, '');
  if (name === 'compare') renderCompare();
}
document.querySelectorAll('.tab-btn,.bn-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── COMPARE TAB ──
function renderCompare() {
  renderCompareCard('A', STATE.compareA);
  renderCompareCard('B', STATE.compareB);
  if (STATE.compareA && STATE.compareB) buildCompareTable();
}
function renderCompareCard(slot, w) {
  const card = $('cpCard' + slot);
  if (!w) { card.innerHTML = '<div class="cp-empty">Chưa chọn vùng</div>'; return; }
  card.innerHTML = `<div class="cp-info-card">
    <div class="cp-info-name">${w.icon} ${w.name}</div>
    <div class="cp-info-dist">${w.type} — ${w.district}</div>
    <div class="cp-info-stats">
      <div class="cp-stat"><div class="cp-sv">${dispTemp(w.temp)}°</div><div class="cp-sl">Nhiệt độ</div></div>
      <div class="cp-stat"><div class="cp-sv">${w.rain}%</div><div class="cp-sl">Mưa</div></div>
      <div class="cp-stat"><div class="cp-sv">${w.humidity}%</div><div class="cp-sl">Độ ẩm</div></div>
      <div class="cp-stat"><div class="cp-sv">${w.wind}km/h</div><div class="cp-sl">Gió</div></div>
    </div>
  </div>`;
}
function buildCompareTable() {
  const A = STATE.compareA, B = STATE.compareB;
  const res = $('compareResult'); if (!res) return;
  const rows = [
    ['Nhiệt độ', `${dispTemp(A.temp)}°`, `${dispTemp(B.temp)}°`, A.temp > B.temp ? 'A' : 'B'],
    ['Nhiệt cao nhất', `${dispTemp(A.hi)}°`, `${dispTemp(B.hi)}°`, A.hi > B.hi ? 'A' : 'B'],
    ['Nhiệt thấp nhất', `${dispTemp(A.lo)}°`, `${dispTemp(B.lo)}°`, A.lo > B.lo ? 'A' : 'B'],
    ['Xác suất mưa', `${A.rain}%`, `${B.rain}%`, A.rain < B.rain ? 'A' : 'B', 'Ít mưa hơn'],
    ['Độ ẩm', `${A.humidity}%`, `${B.humidity}%`, A.humidity < B.humidity ? 'A' : 'B', 'Ít ẩm hơn'],
    ['Tốc độ gió', `${A.wind} km/h`, `${B.wind} km/h`, A.wind < B.wind ? 'A' : 'B', 'Ít gió hơn'],
    ['AQI', `${A.aqi}`, `${B.aqi}`, A.aqi < B.aqi ? 'A' : 'B', 'Không khí tốt hơn'],
  ];
  res.innerHTML = `<table class="compare-table">
    <tr><th>Chỉ số</th><th>${A.name}</th><th>${B.name}</th><th>Tốt hơn</th></tr>
    ${rows.map(([lbl, va, vb, win, why]) => `<tr>
      <td>${lbl}</td>
      <td class="${win==='A'?'td-win':''}">${va}</td>
      <td class="${win==='B'?'td-win':''}">${vb}</td>
      <td>${win === 'A' ? A.name : B.name} ${why||''}</td>
    </tr>`).join('')}
  </table>`;
}

// Compare pick buttons open search overlay and capture slot
['A','B'].forEach(slot => {
  $('cpBtn' + slot) && $('cpBtn' + slot).addEventListener('click', () => {
    STATE.comparePicking = slot;
    openSearch();
  });
});

// Override select ward to also handle compare picking
const origSelectWard = selectWard;
function selectWard2(w) {
  if (STATE.comparePicking) {
    STATE['compare' + STATE.comparePicking] = w;
    renderCompareCard(STATE.comparePicking, w);
    if (STATE.compareA && STATE.compareB) buildCompareTable();
    STATE.comparePicking = null;
    closeSearch();
    showToast(`✅ Đã chọn ${w.name} cho vùng ${STATE.comparePicking || ''}`);
    return;
  }
  origSelectWard(w);
}

// Patch search result click
const origRenderSearch = renderSearchResults;
function renderSearchResults2(filter, query) {
  const list = $('searchResults'); list.innerHTML = '';
  const results = WARDS.filter(w => {
    const dOk = filter === 'all' || w.district === filter;
    const qOk = !query || w.name.toLowerCase().includes(query.toLowerCase()) || w.district.toLowerCase().includes(query.toLowerCase());
    return dOk && qOk;
  });
  if (results.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">Không tìm thấy địa phương nào</div>';
    return;
  }
  results.forEach(w => {
    const item = document.createElement('div'); item.className = 'sr-item';
    item.innerHTML = `<div class="sr-icon">${w.icon}</div>
      <div class="sr-info">
        <div class="sr-name">${w.name}</div>
        <div class="sr-dist">${w.type} — ${w.district}</div>
      </div>
      <div class="sr-weather">
        <span class="sr-temp">${dispTemp(w.temp)}°</span>
        <span class="sr-rain">💧${w.rain}%</span>
      </div>`;
    item.addEventListener('click', () => {
      if (STATE.comparePicking) {
        STATE['compare' + STATE.comparePicking] = w;
        const slot = STATE.comparePicking;
        STATE.comparePicking = null;
        closeSearch();
        renderCompareCard(slot, w);
        if (STATE.compareA && STATE.compareB) buildCompareTable();
        showToast(`✅ Đã chọn ${w.name} cho vùng ${slot}`);
      } else {
        selectWard(w);
        closeSearch();
      }
    });
    list.appendChild(item);
  });
}

// Override functions
window._renderSearch = renderSearchResults2;
$('districtTabs').removeEventListener && null;
$('searchInput').removeEventListener && null;
// Re-bind with updated function
$('districtTabs').addEventListener('click', e => {
  const btn = e.target.closest('.dtab');
  if (!btn) return;
  document.querySelectorAll('.dtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  searchD = btn.dataset.d;
  renderSearchResults2(searchD, $('searchInput').value);
});
$('searchInput').addEventListener('input', e => renderSearchResults2(searchD, e.target.value));
$('searchBtn').removeEventListener('click', openSearch);
$('searchBtn').addEventListener('click', () => { STATE.comparePicking = null; openSearch(); renderSearchResults2('all',''); });

// ── UNIT TOGGLE ──
$('unitToggle').addEventListener('click', () => {
  STATE.unit = STATE.unit === 'C' ? 'F' : 'C';
  $('unitToggle').textContent = '°' + STATE.unit;
  renderHourly();
  renderForecastHome();
  renderChart();
  if ($('tab-forecast').classList.contains('active')) renderForecastFull();
  if ($('tab-wards').classList.contains('active')) renderWardsGrid(wardFilterD, $('wardSearch').value);
  const w = STATE.selectedWard || {temp:32,hi:35,lo:27};
  updateTempDisplay(w.temp, w.hi, w.lo);
  showToast(`Đã chuyển sang ${unitSuffix()}`);
});

// ── THEME TOGGLE ──
$('themeBtn').addEventListener('click', () => {
  STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', STATE.theme);
  $('themeBtn').textContent = STATE.theme === 'dark' ? '🌙' : '☀️';
  showToast(STATE.theme === 'dark' ? '🌙 Giao diện tối' : '☀️ Giao diện sáng');
});

// ── REFRESH ──
$('refreshBtn').addEventListener('click', function() {
  this.textContent = '↻ Đang tải...';
  this.classList.add('spinning');
  setTimeout(() => {
    this.textContent = '↻ Làm mới';
    this.classList.remove('spinning');
    updateClock();
    renderHourly();
    renderForecastHome();
    renderChart();
    showToast('✅ Đã cập nhật dữ liệu!');
  }, 1200);
});

// ── ALERT CLOSE ──
$('alertClose').addEventListener('click', () => {
  const bar = $('alertBar');
  bar.style.transition = 'opacity .3s, max-height .4s';
  bar.style.opacity = '0'; bar.style.maxHeight = '0'; bar.style.overflow = 'hidden';
  bar.style.marginBottom = '0'; bar.style.padding = '0';
});

// ── 3D CARD TILT ──
document.querySelectorAll('.tilt').forEach(el => {
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    el.style.transform = `perspective(400px) rotateY(${x*12}deg) rotateX(${-y*12}deg) translateZ(4px)`;
  });
  el.addEventListener('mouseleave', () => { el.style.transform = ''; });
});

// ── INIT RENDER ──
renderHourly();
renderForecastHome();
setTimeout(renderChart, 300);

// Resize chart on window resize
window.addEventListener('resize', () => renderChart());