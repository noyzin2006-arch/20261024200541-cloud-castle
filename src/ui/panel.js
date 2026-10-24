/**
 * HUD 面板：性能指标 + 最少必要的控制。
 *
 * 所有数值都用 textContent 写入，不拼 HTML。
 */
export function createPanel(mount, { onPause, onReset, onQuality, onSun } = {}) {
  if (!mount) throw new Error('createPanel: 缺少挂载节点');

  mount.textContent = '';

  const root = document.createElement('div');
  const rows = {};

  function addRow(label, key) {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('b');
    value.textContent = '—';
    row.append(name, value);
    root.append(row);
    rows[key] = value;
  }

  addRow('FPS', 'fps');
  addRow('DRAW CALLS', 'calls');
  addRow('三角形', 'triangles');
  addRow('种子', 'seed');
  addRow('画质', 'quality');

  const separator = document.createElement('div');
  separator.className = 'sep';
  root.append(separator);

  const controls = document.createElement('div');
  controls.className = 'controls';
  const buttons = {};

  function addButton(text, key, handler, pressed) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-pressed', String(pressed === true));
    button.addEventListener('click', handler);
    controls.append(button);
    buttons[key] = button;
  }

  addButton('暂停', 'pause', () => onPause && onPause());
  addButton('复位', 'reset', () => onReset && onReset());
  addButton('高画质', 'high', () => onQuality && onQuality('high'), true);
  addButton('低画质', 'low', () => onQuality && onQuality('low'));
  addButton('日照', 'sun', () => onSun && onSun());

  root.append(controls);
  mount.append(root);

  function setText(key, value) {
    const node = rows[key];
    if (node) node.textContent = value;
  }

  return {
    update(stats) {
      if (!stats) return;
      if (stats.fps !== undefined) setText('fps', stats.fps.toFixed(0));
      if (stats.calls !== undefined) setText('calls', String(stats.calls));
      if (stats.triangles !== undefined) setText('triangles', stats.triangles.toLocaleString('en-US'));
      if (stats.seed !== undefined) setText('seed', String(stats.seed));
      if (stats.quality !== undefined) setText('quality', stats.quality);
    },
    setPaused(paused) {
      buttons.pause.textContent = paused ? '继续' : '暂停';
    },
    setQuality(name) {
      buttons.high.setAttribute('aria-pressed', String(name === 'high'));
      buttons.low.setAttribute('aria-pressed', String(name === 'low'));
    },
    dispose() {
      mount.textContent = '';
    }
  };
}
