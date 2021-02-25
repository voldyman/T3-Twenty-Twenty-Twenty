const activeWin = require('active-win');
const { app, screen, Tray, Menu, nativeTheme, Notification, BrowserWindow, ipcMain } = require('electron');
const url = require('url');
const path = require('path');
const moment = require('moment');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

const getIcon = () => {
  if (nativeTheme.shouldUseDarkColors) {
    console.log('darkmode');
  }
  return path.join(__dirname, '/../assets/sunTemplate@2x.png');
}

const getActiveWindow = async () => {
  let activeWindow = await activeWin();
  if (activeWindow != undefined) {
    return activeWindow.owner.name;
  }
  return null;
}

class Timer {
  constructor({ timoutInSec, onTimeout, interval: {intervalInSec, intervalHandler} }) {
    this.timeout = timoutInSec ? timoutInSec * 1000 : 5 * 1000;
    this.fn = onTimeout || (() => { console.log('timer timed out but no handler configured'); })
    this.timerHandle = null;

    if (intervalInSec && intervalHandler) {
      this.interval = {
        time: intervalInSec * 1000, 
        onIntervalFn: intervalHandler,
        handle: null
      };
    }
  }

  running() {
    return this.timerHandle != null;
  }
  
  start() {
    const timeoutTime = moment().add(this.timeout, 'milliseconds');
    this.timerHandle != null && clearInterval(this.timerHandle);
    this.timerHandle = setInterval(() => { this._callback(); }, this.timeout);
    

    if (this.interval) {
      this.interval.handle != null && clearInterval(this.intervalHandle);
      
      const intervalFn = () => {
          const left = timeoutTime.diff(moment(), 'minutes');
          this.interval.onIntervalFn(left);
      };
      intervalFn();
      this.interval.handle = setInterval(intervalFn, this.interval.time);
    }
  }

  stop() {
    clearInterval(this.timerHandle);
    this.timerHandle = null;

    clearInterval(this.interval.handle);
    this.interval.handle = null;
  }

  _callback() {
    const notification = {
      title: "Break Time!",
      body: "It's been a while, time to stare out in the wilderness for 20 minutes"
    };
    new Notification(notification).show();
    getActiveWindow()
      .then((ps) => { this.fn(ps); })
      .catch((err) => { console.log(`unable to get active title: ${err}`) });
  }
}

class TrayIcon {
  constructor({ onStart, onStop, onQuit, onAbout }) {
    this.onStartFn = onStart || (() => { });
    this.onStopFn = onStop || (() => { });
    this.onQuitFn = onQuit || (() => { console.log('on quit not set'); });
    this.onAboutFn = onAbout || (() => { console.log('on about not set'); });
    this.tray = this._setupTray();
  }

  setTitle(text) {
    this.tray.setTitle(text);
  }

  _setupTray() {
    const that = this;
    const menu = Menu.buildFromTemplate([
      {
        label: "Start",
        click() { that.onStartFn(); }
      },
      {
        label: "Stop",
        click() { that.onStopFn(); }
      },
      {
        type: "separator"
      },
      {
        label: "&About",
        click() { that.onAboutFn(); }
      },
      {
        label: "&Quit",
        click() { that.onQuitFn(); }
      }
    ]);
    
    let t = new Tray(getIcon());
    t.setToolTip("t3");
    t.setContextMenu(menu);
    return t;
  }
}

ipcMain.on('interstitial', (event, args) => {
  if (args == 'close-clicked') {
    console.log('closed clicked in the interstitial window');
  }
})

const openInterstitial = (onClose) => {
  let displayDimensions = screen.getPrimaryDisplay().size;
  let window = new BrowserWindow({
    transparent: true,
    width: displayDimensions.width,
    height: displayDimensions.height,
    vibrancy: 'fullscreen-ui',
    titleBarStyle: 'hidden',
    frame: false,
    title: "temp",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      devTools: true
    }
  });

  window.loadURL(url.pathToFileURL(path.join(__dirname, 'interstitial.html')).href);
  window.show();
  window.webContents.openDevTools();

  window.on('closed', () => { onClose(); });
}

const defaultInterruptionTime = 20 * 60; // 20 minutes
let tray = null;
let timerEnabled = true;

const getTray = () => { return tray; };

app.whenReady().then(() => {
  if (app.dock) {
    // we are a try only app
    app.dock.hide();
  }
  
  let timer = new Timer({
    timoutInSec: defaultInterruptionTime,
    onTimeout: () => {
      const tray = getTray();
      tray.setTitle("");
      timer.stop();
      openInterstitial(() => { 
        timer.stop();
        timerEnabled && timer.start();
      });
    },
    interval: {
      intervalInSec: 60,
      intervalHandler: (count) => {
        const tray = getTray();
        if (tray) {
          tray.setTitle(`${count}`)
        }
      }
    }
  });
  tray = new TrayIcon({
    onStart: () => { 
      console.log('start clicked');
      timer.start(); 
      timerEnabled = true;
    },
    onStop: () => { 
      console.log('stop clicked');
      timer.stop(); 
      timerEnabled = false;
    },
    onQuit: () => { app.quit(); }
  })

  timer.start();
  timerEnabled = true;
});

app.on('window-all-closed', () => {
  // don't quit!
});