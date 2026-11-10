(() => {
    'use strict';

    const page = document.getElementById('qsl-page');
    if (!page) return;

    const logs = JSON.parse(document.getElementById('qsl-log-data').textContent);
    const form = page.querySelector('#qsl-filters');
    const callsignInput = page.querySelector('#callsign-filter');
    const frequencyInput = page.querySelector('#frequency-filter');
    const modeInput = page.querySelector('#mode-filter');
    const startInput = page.querySelector('#date-start');
    const endInput = page.querySelector('#date-end');
    const sortInput = page.querySelector('#qsl-sort');
    const body = page.querySelector('#qsl-table-body');
    const count = page.querySelector('#displayed-count');
    const context = page.querySelector('#qsl-result-context');
    const historyCaption = page.querySelector('#qsl-history-caption');
    const activeFilters = page.querySelector('#qsl-active-filters');
    const dateError = page.querySelector('#qsl-date-error');
    const empty = page.querySelector('#qsl-empty');
    const emptyDescription = page.querySelector('#qsl-empty-description');
    const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
    let exactCallsign = '';

    const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);

    // Keep incomplete times intact; an unknown minute sorts before known minutes in the same hour.
    function timeValue(time) {
        const match = /^(\d{2}):(\d{2}|xx)$/i.exec(time || '');
        if (!match) return -1;
        return Number(match[1]) * 60 + (match[2].toLowerCase() === 'xx' ? -1 : Number(match[2]));
    }

    function compareDateTime(a, b) {
        return a.date.localeCompare(b.date) || timeValue(a.time) - timeValue(b.time);
    }

    function compareLogs(a, b) {
        const [column, direction] = sortInput.value.split('-');
        let comparison;
        if (column === 'datetime') comparison = compareDateTime(a, b);
        else if (column === 'frequency') comparison = parseFloat(a.frequency) - parseFloat(b.frequency);
        else comparison = collator.compare(a.callsign, b.callsign);
        return comparison ? comparison * (direction === 'desc' ? -1 : 1) : -compareDateTime(a, b);
    }

    function renderRow(log) {
        const callsign = escapeHTML(log.callsign);
        const date = escapeHTML(log.date);
        const displayValue = value => escapeHTML(value === '-' || !value ? '—' : value);
        return `<tr class="qsl-data-row">
            <td class="qsl-cell-datetime"><time datetime="${date}">${date}</time><span class="qsl-time qsl-mono">${escapeHTML(log.time === '-' || !log.time ? '时间未记录' : log.time)}</span></td>
            <td class="qsl-cell-callsign"><button type="button" class="qsl-callsign qsl-mono" data-callsign="${callsign}" aria-label="查看 ${callsign} 的全部通联">${callsign}</button></td>
            <td class="qsl-cell-frequency"><span class="qsl-frequency qsl-mono">${escapeHTML(log.frequency.replace(/MHz$/i, ''))}<span class="qsl-unit"> MHz</span></span><span class="qsl-mode">${escapeHTML(log.mode)}</span></td>
            <td class="qsl-cell-report"><span class="qsl-mobile-label">信号 </span><span class="qsl-mono">${escapeHTML(log.report === '-' ? '—' : log.report)}</span></td>
            <td class="qsl-cell-location"><span class="qsl-mobile-label">位置 </span>${escapeHTML(log.location === '-' ? '未记录' : log.location)}</td>
            <td class="qsl-cell-equipment"><span class="qsl-mobile-label">设备 </span>${displayValue(log.equipment)}</td>
            <td class="qsl-cell-antenna"><span class="qsl-mobile-label">天线 </span>${displayValue(log.antenna)}</td>
            <td class="qsl-cell-power"><span class="qsl-mobile-label">功率 </span><span class="qsl-mono">${displayValue(log.power)}</span></td>
            <td class="qsl-cell-remarks"><span class="qsl-mobile-label">备注 </span>${displayValue(log.remarks)}</td>
        </tr>`;
    }

    function updateSortHeaders() {
        const [column, direction] = sortInput.value.split('-');
        page.querySelectorAll('[data-sort-column]').forEach(header => {
            const selected = header.dataset.sortColumn === column;
            header.setAttribute('aria-sort', selected ? (direction === 'desc' ? 'descending' : 'ascending') : 'none');
            header.querySelector('i').className = `fas ${selected ? (direction === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up') : 'fa-sort'}`;
        });
    }

    function render() {
        [startInput, endInput].forEach(input => {
            page.querySelector(`[data-date-display="${input.id}"]`).textContent = input.value || '年-月-日';
            input.parentElement.classList.toggle('has-value', Boolean(input.value));
        });
        const query = callsignInput.value.trim().toUpperCase();
        const invalidDates = Boolean(startInput.value && endInput.value && startInput.value > endInput.value);
        dateError.hidden = !invalidDates;
        startInput.setAttribute('aria-invalid', String(invalidDates));
        endInput.setAttribute('aria-invalid', String(invalidDates));

        const filtered = invalidDates ? [] : logs.filter(log => {
            const callsign = log.callsign.toUpperCase();
            return (!query || (exactCallsign ? callsign === exactCallsign : callsign.includes(query))) &&
                (!frequencyInput.value || log.frequency === frequencyInput.value) &&
                (!modeInput.value || log.mode === modeInput.value) &&
                (!startInput.value || log.date >= startInput.value) &&
                (!endInput.value || log.date <= endInput.value);
        }).sort(compareLogs);

        body.innerHTML = filtered.map(renderRow).join('');
        count.textContent = filtered.length;
        context.textContent = exactCallsign ? ` · ${exactCallsign} 的全部通联` : (filtered.length !== logs.length ? ` / 全部 ${logs.length} 条` : '');
        empty.hidden = filtered.length !== 0;
        emptyDescription.textContent = invalidDates ? '请调整日期范围，让开始日期早于或等于结束日期。' : '试试其他呼号，或放宽日期、频率和模式条件。';

        historyCaption.hidden = !exactCallsign;
        if (exactCallsign && filtered.length) {
            const dates = filtered.map(log => log.date).sort();
            historyCaption.textContent = `首次相遇 ${dates[0]} · 最近通联 ${dates[dates.length - 1]}`;
        } else historyCaption.textContent = '';

        const filters = [
            query && !exactCallsign && `呼号包含 ${query}`,
            frequencyInput.value && `频率 ${frequencyInput.value}`,
            modeInput.value && `模式 ${modeInput.value}`,
            (startInput.value || endInput.value) && `日期 ${startInput.value || '不限'} — ${endInput.value || '不限'}`
        ].filter(Boolean);
        activeFilters.hidden = !filters.length;
        activeFilters.textContent = filters.join(' · ');
        updateSortHeaders();
    }

    function resetFilters() {
        exactCallsign = '';
        callsignInput.value = '';
        frequencyInput.value = '';
        modeInput.value = '';
        startInput.value = '';
        endInput.value = '';
        sortInput.value = 'datetime-desc';
        render();
    }

    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('reset', event => {
        event.preventDefault();
        resetFilters();
    });
    callsignInput.addEventListener('input', () => {
        exactCallsign = '';
        render();
    });
    [frequencyInput, modeInput, startInput, endInput].forEach(input => input.addEventListener('change', () => {
        if (exactCallsign) exactCallsign = '';
        render();
    }));
    sortInput.addEventListener('change', render);
    [startInput, endInput].forEach(input => {
        input.addEventListener('input', () => {
            exactCallsign = '';
            render();
        });
        const openCalendar = () => {
            if (typeof input.showPicker !== 'function') return;
            try { input.showPicker(); } catch (_) { /* Native input remains available as a fallback. */ }
        };
        input.addEventListener('click', openCalendar);
        input.addEventListener('keydown', event => {
            if ((event.key === 'Enter' || event.key === ' ') && typeof input.showPicker === 'function') {
                event.preventDefault();
                openCalendar();
            }
        });
    });

    page.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || !page.contains(button)) return;
        if (button.hasAttribute('data-reset')) resetFilters();
        if (button.dataset.callsign) {
            resetFilters();
            exactCallsign = button.dataset.callsign.toUpperCase();
            callsignInput.value = exactCallsign;
            render();
            // Keep the history context in view and give keyboard users a stable focus target.
            if (event.detail === 0) callsignInput.focus({ preventScroll: true });
            page.querySelector('#qsl-logbook-title').scrollIntoView({ block: 'start', behavior: 'auto' });
        }
        if (button.dataset.sort) {
            const [column, direction] = sortInput.value.split('-');
            const nextDirection = column === button.dataset.sort && direction === 'asc' ? 'desc' : 'asc';
            sortInput.value = `${button.dataset.sort}-${nextDirection}`;
            render();
        }
    });

    page.classList.add('qsl-date-enhanced');
    render();
})();
