import assert from 'node:assert/strict'

export const POPUP_ZOOM_FACTORS = [1, 1.25, 1.5]
export const POPUP_LAYOUT_STATES = [
  'pairing',
  'connected',
  'unsupported',
  'long-chain-list',
  'network-refresh-error',
  'identity-confirmation'
]

export function popupLayoutExpression(zoom, state) {
  return `(() => {
    const zoom = ${JSON.stringify(zoom)};
    const state = ${JSON.stringify(state)};
    document.documentElement.style.zoom = String(zoom);

    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const main = document.querySelector('main');
    const controls = [...document.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), [role="radio"]:not(:disabled)'
    )].filter(visible);
    const tabbableControls = controls.filter((element) => element.tabIndex >= 0);
    const undersizedControls = controls.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label') || element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80),
        width: rect.width,
        height: rect.height
      };
    }).filter(({ width, height }) => width < 44 || height < 44);
    const textElements = [...document.querySelectorAll('body *')].filter(
      (element) => visible(element) && [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
      )
    );
    const undersizedText = textElements.map((element) => ({
      label: element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80),
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize)
    })).filter(({ fontSize }) => fontSize < 12);
    const focusFailures = [];
    for (const control of tabbableControls) {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const rect = control.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const viewportWidth = window.visualViewport?.width || window.innerWidth;
      if (
        document.activeElement !== control ||
        rect.bottom <= 0 ||
        rect.top >= viewportHeight ||
        rect.right <= 0 ||
        rect.left >= viewportWidth
      ) {
        focusFailures.push(
          control.getAttribute('aria-label') || control.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80)
        );
      }
    }
    const lastControl = tabbableControls.at(-1);
    if (lastControl) {
      lastControl.focus();
      lastControl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const lastRect = lastControl?.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const lastControlReachable = !lastControl || (
      document.activeElement === lastControl &&
      lastRect.bottom > 0 && lastRect.top < viewportHeight &&
      lastRect.right > 0 && lastRect.left < viewportWidth
    );
    return {
      state,
      zoom,
      bodyWidth: document.body.getBoundingClientRect().width,
      bodyCssWidth: getComputedStyle(document.body).width,
      viewportWidth,
      viewportHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      mainClientWidth: main?.clientWidth || 0,
      mainScrollWidth: main?.scrollWidth || 0,
      controlCount: controls.length,
      tabbableCount: tabbableControls.length,
      undersizedControls,
      undersizedText,
      focusFailures,
      lastControlReachable,
      focusedLabel: document.activeElement?.getAttribute?.('aria-label') ||
        document.activeElement?.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 80) || ''
    };
  })()`
}

export function assertPopupLayout(report) {
  assert.ok(report, 'popup returned layout evidence')
  if (report.state !== 'pairing') {
    assert.ok(report.controlCount > 0, `${report.state} at ${report.zoom}: no active controls`)
    assert.ok(report.tabbableCount > 0, `${report.state} at ${report.zoom}: no keyboard controls`)
  }
  assert.equal(
    report.bodyCssWidth,
    '420px',
    `${report.state} at ${report.zoom}: popup bootstrap width changed`
  )
  assert.ok(
    report.documentScrollWidth <= report.documentClientWidth + 1,
    `${report.state} at ${report.zoom}: document overflow ${JSON.stringify(report)}`
  )
  assert.ok(
    report.mainScrollWidth <= report.mainClientWidth + 1,
    `${report.state} at ${report.zoom}: popup overflow ${JSON.stringify(report)}`
  )
  assert.deepEqual(
    report.undersizedControls,
    [],
    `${report.state} at ${report.zoom}: active target below 44px`
  )
  assert.deepEqual(
    report.undersizedText,
    [],
    `${report.state} at ${report.zoom}: functional text below 12px`
  )
  assert.deepEqual(
    report.focusFailures,
    [],
    `${report.state} at ${report.zoom}: control could not be focused and revealed`
  )
  assert.equal(
    report.lastControlReachable,
    true,
    `${report.state} at ${report.zoom}: last control is not scroll-reachable`
  )
}
