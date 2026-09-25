/* Static GitHub Pages build: uses site.js api() shim + GitHub session auth. */
(() => {
  let donations = [], ready = false, errorText = '', refreshing = null;
  let saving = false;
  const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat('vi-VN');

  function donorRow(donation, compact = false, hall = false) {
    const name = String(donation.name || 'Ẩn danh');
    const words = name.trim().split(/\s+/);
    const initials = (words.length > 1 ? words[0][0] + words.at(-1)[0] : name.slice(0, 2)).toUpperCase();
    const color = ['', 'rose', 'blue', 'mint'][Array.from(name).reduce((sum, char) => sum + char.codePointAt(0), 0) % 4];
    const date = new Date(String(donation.donatedAt) + 'T12:00:00');
    return `<div class="donor-row"${hall ? ' role="listitem"' : ''}><span class="donor-avatar ${color}" aria-hidden="true">${esc(initials)}</span><div class="donor-content"><div class="donor-top"><strong class="donor-name">${esc(name)}</strong>${!compact && donation.amount ? `<span class="donor-amount">${hall ? 'Donate: ' : ''}${esc(money.format(donation.amount))}</span>` : ''}</div><time class="donor-date" datetime="${esc(donation.donatedAt)}">${Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)}</time>${!compact && donation.message ? `<p class="donor-message">${esc(donation.message)}</p>` : ''}</div></div>`;
  }

  // Scroll the actual records so keyboard and screen-reader users see each donor once.
  // Reaching the end pauses briefly, then returns to the beginning without cloned rows.
  const ticker = (() => {
    const list = $('#donorWallList');
    const view = $('#donateView');
    const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
    const toggle = document.createElement('button');
    toggle.id = 'donorTickerToggle';
    toggle.className = 'btn donor-ticker-toggle hidden';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', 'donorWallList');
    list.after(toggle);
    list.tabIndex = 0;
    list.setAttribute('aria-label', 'Danh sách người ủng hộ. Có thể cuộn để xem tất cả.');
    list.setAttribute('aria-live', 'off');
    let manualPaused = false, hovering = false, focused = false, inViewport = true;
    let frame = null, lastTime = null, boundaryPause = 0, fractionalStep = 0;

    function overflowing() { return list.scrollHeight > list.clientHeight + 1; }
    function canRun() {
      return overflowing() && !manualPaused && !hovering && !focused && inViewport &&
        !reducedMotion.matches && !document.hidden && !view.hidden && !view.classList.contains('hidden');
    }
    function stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
    }
    function step(time) {
      frame = null;
      if (!canRun()) { lastTime = null; return; }
      if (lastTime !== null) {
        const elapsed = Math.min(time - lastTime, 100);
        if (boundaryPause > 0) {
          boundaryPause -= elapsed;
          if (boundaryPause <= 0 && list.scrollTop >= list.scrollHeight - list.clientHeight - 1) {
            list.scrollTop = 0;
            boundaryPause = 800;
          }
        } else {
          const end = list.scrollHeight - list.clientHeight;
          fractionalStep += elapsed * 0.022;
          const pixels = Math.floor(fractionalStep);
          fractionalStep -= pixels;
          list.scrollTop = Math.min(end, list.scrollTop + pixels);
          if (list.scrollTop >= end - 1) boundaryPause = 1800;
        }
      }
      lastTime = time;
      frame = requestAnimationFrame(step);
    }
    function update() {
      const overflow = overflowing();
      toggle.classList.toggle('hidden', !overflow);
      toggle.disabled = reducedMotion.matches;
      toggle.setAttribute('aria-pressed', String(!manualPaused && !reducedMotion.matches));
      toggle.textContent = reducedMotion.matches ? 'Tự cuộn: Tắt theo cài đặt giảm chuyển động' : manualPaused ? 'Tự cuộn: Tắt' : 'Tự cuộn: Bật';
      toggle.title = reducedMotion.matches ? 'Bạn đang bật cài đặt giảm chuyển động.' : 'Di chuột hoặc đặt tiêu điểm vào danh sách để tạm dừng. Chạm hoặc cuộn sẽ tắt tự cuộn.';
      if (canRun()) {
        if (frame === null) frame = requestAnimationFrame(step);
      } else stop();
    }
    function pauseForReading() { manualPaused = true; update(); }
    toggle.addEventListener('click', () => { manualPaused = !manualPaused; boundaryPause = 0; update(); });
    list.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; update(); } });
    list.addEventListener('pointerleave', () => { hovering = false; update(); });
    list.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') pauseForReading(); });
    list.addEventListener('wheel', pauseForReading, { passive: true });
    list.addEventListener('focusin', () => { focused = true; update(); });
    list.addEventListener('focusout', event => { focused = list.contains(event.relatedTarget); update(); });
    document.addEventListener('visibilitychange', update);
    window.addEventListener('resize', update);
    reducedMotion.addEventListener('change', update);
    new MutationObserver(update).observe(view, { attributes: true, attributeFilter: ['class', 'hidden'] });
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(list);
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      inViewport = entries[0].isIntersecting;
      update();
    }).observe(list);
    return { update };
  })();

  function render() {
    $('#donationCount').textContent = ready ? donations.length.toLocaleString('vi-VN') : '—';
    const problem = errorText ? `<p class="community-muted" role="status">${esc(errorText)}</p><button type="button" class="btn" data-retry-donations>Thử lại</button>` : '';
    const empty = '<div class="donor-empty"><span class="support-heart" aria-hidden="true">♡</span><strong>Chờ lời tiếp sức đầu tiên</strong><p>Tên người ủng hộ sẽ xuất hiện tại đây sau khi được xác nhận. Cảm ơn bạn đã ghé GameHub!</p></div>';
    const list = $('#donorWallList');
    const rows = donations.length ? `<div class="donor-wall-records" role="list">${donations.map(d => donorRow(d, false, true)).join('')}</div>` : ready && !errorText ? empty : '';
    const wallMarkup = problem + rows;
    if (list.innerHTML !== wallMarkup) {
      const scrollPosition = list.scrollTop;
      list.innerHTML = wallMarkup;
      list.scrollTop = scrollPosition;
    }
    list.classList.toggle('has-donors', donations.length > 0);
    $('#recentDonors').innerHTML = problem + (donations.length ? donations.slice(0, 4).map(d => donorRow(d, true)).join('') : ready && !errorText ? '<p class="community-muted">Chưa có khoản ủng hộ nào được ghi nhận. Mỗi sự tiếp sức đều rất đáng quý.</p>' : '');
    $('#moreDonors').classList.add('hidden');
    ticker.update();
    renderAdminDonations();
  }

  function renderAdminDonations() {
    if (!loggedIn) { $('#adminDonationList').replaceChildren(); return; }
    $('#adminDonationList').innerHTML = donations.length ? donations.map(d => `<div class="admin-item">${donorRow(d)}<div class="actions"><button class="btn" type="button" data-donation-edit="${esc(d.id)}" ${saving ? 'disabled' : ''}>Sửa</button><button class="btn danger" type="button" data-donation-delete="${esc(d.id)}" ${saving ? 'disabled' : ''}>Xóa</button></div></div>`).join('') : '<p class="community-muted">Chưa có khoản ủng hộ được ghi nhận.</p>';
  }

  async function loadDonations() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const result = await api('/api/donations');
        if (!Array.isArray(result)) throw new Error('Dữ liệu không hợp lệ');
        donations = result;
        ready = true;
        errorText = '';
      } catch {
        errorText = donations.length ? 'Chưa thể làm mới danh sách. Đang hiển thị dữ liệu đã tải.' : 'Chưa tải được danh sách ủng hộ. Bạn vui lòng thử lại.';
      } finally { render(); }
    })();
    try { await refreshing; } finally { refreshing = null; }
  }

  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function resetDonation() {
    $('#donationForm').reset();
    $('#donationEditId').value = '';
    $('#donatedAt').value = today();
    $('#saveDonation').textContent = 'Ghi nhận ủng hộ';
    $('#donationStatus').textContent = '';
  }
  function setBusy(busy) {
    saving = busy;
    $('#donationForm').querySelectorAll('input, textarea, button').forEach(el => { el.disabled = busy; });
    renderAdminDonations();
  }
  async function refreshAfterWrite() {
    // Finish an earlier poll before fetching the new server state.
    if (refreshing) await refreshing;
    await loadDonations();
  }

  $('#donationForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    const id = $('#donationEditId').value;
    const payload = { name: $('#donorName').value.trim(), amount: $('#donorAmount').value === '' ? null : Number($('#donorAmount').value), donatedAt: $('#donatedAt').value, message: $('#donorMessage').value.trim(), confirmed: $('#donationConfirmed').checked };
    setBusy(true);
    $('#donationStatus').textContent = 'Đang lưu khoản ủng hộ…';
    try {
      await api(id ? '/api/donations/' + encodeURIComponent(id) : '/api/donations', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      resetDonation();
      $('#donationStatus').textContent = id ? 'Đã cập nhật người ủng hộ.' : 'Đã ghi nhận. Tên người ủng hộ đã được công khai.';
      await refreshAfterWrite();
    } catch (error) { $('#donationStatus').textContent = error.message; }
    finally { setBusy(false); }
  });

  $('#resetDonation').addEventListener('click', resetDonation);
  document.addEventListener('click', async event => {
    if (event.target.closest('[data-retry-donations]')) { await loadDonations(); return; }
    if (event.target.closest('[data-go="/donate"]')) loadDonations();
    if (!loggedIn || saving) return;
    const edit = event.target.closest('[data-donation-edit]');
    if (edit) {
      const d = donations.find(item => item.id === edit.dataset.donationEdit);
      if (!d) return;
      $('#donationEditId').value = d.id;
      $('#donorName').value = d.name;
      $('#donorAmount').value = d.amount ?? '';
      $('#donatedAt').value = d.donatedAt;
      $('#donorMessage').value = d.message || '';
      $('#donationConfirmed').checked = false;
      $('#saveDonation').textContent = 'Lưu thay đổi';
      $('#donationStatus').textContent = 'Đang sửa khoản ủng hộ. Kiểm tra thông tin trước khi lưu.';
      $('#donationForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#donorName').focus({ preventScroll: true });
    }
    const remove = event.target.closest('[data-donation-delete]');
    if (remove) {
      const d = donations.find(item => item.id === remove.dataset.donationDelete);
      if (!d || !confirm(`Xóa khoản ủng hộ của “${d.name}” khỏi danh sách công khai?`)) return;
      setBusy(true);
      try {
        await api('/api/donations/' + encodeURIComponent(d.id), { method: 'DELETE' });
        if ($('#donationEditId').value === d.id) resetDonation();
        $('#donationStatus').textContent = 'Đã xóa khỏi danh sách công khai.';
        await refreshAfterWrite();
      } catch (error) { $('#donationStatus').textContent = error.message; }
      finally { setBusy(false); }
    }
  });

  function syncRpg() {
    const present = $('#genres').value.split(',').some(tag => /^rpg$/i.test(tag.trim()));
    $('#addRpgTag').setAttribute('aria-pressed', String(present));
    $('#addRpgTag').textContent = present ? '✓ RPG' : '+ RPG';
    $('#rpgTagStatus').textContent = present ? 'Đã có tag RPG' : '';
  }
  $('#addRpgTag').addEventListener('click', () => {
    const tags = $('#genres').value.split(',').map(tag => tag.trim()).filter(Boolean);
    if (!tags.some(tag => /^rpg$/i.test(tag))) tags.push('RPG');
    $('#genres').value = tags.join(', ');
    syncRpg();
  });
  $('#genres').addEventListener('input', syncRpg);
  document.addEventListener('gamehub:genres', syncRpg);
  document.addEventListener('gamehub:auth', () => {
    if (!loggedIn) resetDonation();
    renderAdminDonations();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDonations(); });
  setInterval(() => { if (!document.hidden && !saving) loadDonations(); }, 60000);
  resetDonation();
  syncRpg();
  loadDonations();
})();
