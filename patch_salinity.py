import sys
import re

def patch_index():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    target_block = '''          </article>
        </div>
      </section>'''
    
    # Try different newline combinations
    target_block_crlf = '''          </article>\r
        </div>\r
      </section>'''
      
    replacement_block = '''          </article>
          <article class="detail-card comp-detail-card" id="salinityForecastCard">
            <h3 class="detail-title">Độ mặn dự báo</h3>
            <p class="detail-stat accent-warm" id="detailSalinity">—</p>
            <p class="detail-note" id="detailSalinityNote">Theo trạm thủy văn</p>
            <div class="bar-track">
              <div class="bar-fill" id="salinityBarFill" style="width:0%; background-color:var(--warm);"></div>
            </div>
          </article>
        </div>
      </section>'''

    if "salinityForecastCard" in content:
        print("index.html already patched")
        return
        
    new_content = content.replace(target_block, replacement_block)
    if new_content == content:
        new_content = content.replace(target_block_crlf, replacement_block)
        
    if new_content == content:
        # Fallback to regex
        new_content = re.sub(
            r'</article>\s*</div>\s*</section>',
            '''</article>
          <article class="detail-card comp-detail-card" id="salinityForecastCard">
            <h3 class="detail-title">Độ mặn dự báo</h3>
            <p class="detail-stat accent-warm" id="detailSalinity">—</p>
            <p class="detail-note" id="detailSalinityNote">Theo trạm thủy văn</p>
            <div class="bar-track">
              <div class="bar-fill" id="salinityBarFill" style="width:0%; background-color:var(--warm);"></div>
            </div>
          </article>
        </div>
      </section>''',
            content, count=1
        )

    if new_content != content:
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Patched index.html")
    else:
        print("Failed to patch index.html")

def patch_js():
    with open('script.js', 'r', encoding='utf-8') as f:
        content = f.read()

    salinity_logic = """
    // Forecast Salinity Index integration
    const nearestSt = getNearestStationData();
    if (nearestSt && nearestSt.salinity && nearestSt.salinity !== 'N/A') {
      const salVal = parseFloat(nearestSt.salinity);
      const salStat = document.getElementById('detailSalinity');
      const salNote = document.getElementById('detailSalinityNote');
      const salBar = document.getElementById('salinityBarFill');
      
      let salFcst = salVal;
      // Adjust slightly based on 12h forecast
      const rainPoints = getInterpolated24h().slice(0, 12).reduce((sum, h) => sum + (h.pop || 0), 0);
      const isRaining = rainPoints > 3; 
      if (isRaining) salFcst = Math.max(0, salVal - 0.2);
      
      if (salStat) {
          salStat.textContent = salFcst.toFixed(1) + '‰';
          if (salFcst <= 4) {
             salStat.className = 'detail-stat accent-ok';
             salNote.textContent = isRaining ? 'An toàn, có xu hướng giảm do mưa' : 'An toàn cho nông nghiệp (≤ 4‰)';
             salBar.style.backgroundColor = 'var(--ok)';
          } else if (salFcst <= 10) {
             salStat.className = 'detail-stat accent-warn';
             salNote.textContent = 'Cảnh báo mặn - Thủy sản cần chú ý';
             salBar.style.backgroundColor = 'var(--warn)';
          } else {
             salStat.className = 'detail-stat accent-danger';
             salNote.textContent = 'Độ mặn rủi ro cao sinh thái';
             salBar.style.backgroundColor = 'var(--danger)';
          }
          salBar.style.width = Math.min((salFcst / 15) * 100, 100) + '%';
      }
    } else {
      const salStat = document.getElementById('detailSalinity');
      if (salStat) salStat.textContent = '--‰';
    }
"""

    if "detailSalinity" not in content and "applyDynamicBackground(d);" in content:
        new_content = content.replace("applyDynamicBackground(d);", salinity_logic + "\n    applyDynamicBackground(d);")
        with open('script.js', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Patched script.js")
    else:
        print("script.js already patched or target not found")

patch_index()
patch_js()
