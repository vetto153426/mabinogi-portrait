// 페이지(위젯 모드)에서 창을 옮길 수 있게 해 주는 최소한의 다리
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('widgetBridge', {
  move: (dx, dy) => ipcRenderer.send('widget-move', dx, dy),
  ratio: r => ipcRenderer.send('widget-ratio', r)
});
