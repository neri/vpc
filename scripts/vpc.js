
const $ = x => document.querySelector(x);

const loadDiskImage = async (callback) => {
    const target = $('#selDiskImage');
    const imageName = target.value;
    if (!imageName.length) {
        target.removeAttribute('disabled');
        callback(null);
        return;
    }
    target.setAttribute('disabled', true);
    $('#labelLocal').value = 'Loading...';
    console.log(`Loading image ${imageName}...`)
    return fetch(imageName)
        .then(res => {
            if (!res.ok) { throw Error(res.statusText); }
            return res.blob()
        })
        .then(blob => {
            return new Promise((resolve, _) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result);
                };
                reader.readAsArrayBuffer(blob);
            });
        })
        .then(buffer => {
            let name = imageName.slice(1 + imageName.lastIndexOf('/'));
            const pos = name.indexOf('?');
            if (pos > 0) {
                name = name.slice(0, pos);
            }
            $('#labelLocal').value = `file: ${name}`;
            target.removeAttribute('disabled');
            callback(buffer);
        })
        .catch(reason => {
            $('#labelLocal').value = '#ERROR';
            target.removeAttribute('disabled');
            throw reason;
        })
}

const flipElement = (dom) => {
    const list = dom.classList;
    if (list.contains('dimScreen')) {
        list.remove('dimScreen');
        return false;
    } else {
        list.add('dimScreen');
        return true;
    }
}

const startEmu = () => {
    $('#screen_container').style.display = 'block';
    $('#click_to_start').style.display = 'none';
    $('#selMemory').disabled = true;
    $('#selDiskImage').disabled = true;

    if (window.beep) {
        window.beep.createAudioContext(); // IMPORTANT!
    }

    const term = $('#terminal');
    term.write = function (message) {
        // TODO:
    }
    const keyEvent = (e) => {
        // console.log('key', e);
        const event = ['type', 'code', 'key', 'keyCode', 'ctrlKey', 'altKey'].reduce((a, b) => {
            a[b] = e[b];
            return a;
        }, {});
        window.worker.postMessage({ command: 'key', data: event });
    }
    term.addEventListener('keydown', e => {
        if (e.metaKey) return;
        e.preventDefault();
        keyEvent(e);
    });
    term.addEventListener('keyup', e => {
        if (e.metaKey) return;
        e.preventDefault();
        keyEvent(e);
    });
    term.addEventListener('textInput', e => {
        e.preventDefault();
        // window.worker.postMessage({command: 'key', data: e.data});
    });
    window.term = term;
    $('#keyFocusButton').addEventListener('click', e => {
        term.focus();
    });
    setTimeout(() => term.focus(), 100);
    term.focus();

    setTimeout(startSecond, 100);
}

const startSecond = () => {

    const worker = new Worker('lib/worker.js');
    window.worker = worker;
    window.vga.showProgress(0.25);

    worker.onmessage = message => {
        switch (message.data.command) {
            case 'loaded':
                {
                    window.vga.showProgress(0.5);
                    loadDiskImage((blob) => {
                        $('#frameFD').removeAttribute('disabled');
                        window.vga.showProgress(1);
                        let cmd = {
                            command: 'start',
                            gen: parseInt($('#selCpuGen').value),
                            mem: parseInt($('#selMemory').value),
                            br_mbr: $('#optionDebugMBR').checked,
                        };
                        if (window.attach) {
                            window.worker.postMessage({ command: 'attach', blob: window.attach });
                            window.attach = undefined;
                        } else if (blob != null) {
                            window.worker.postMessage({ command: 'attach', blob: blob });
                        }
                        window.worker.postMessage(devmgr.connect(cmd));
                    })
                    break;
                }
            case 'alert':
                alert(message.data.data);
                break;
            case 'write':
            // window.term.write(message.data.data);
            // break;
            case 'devWrite':
                {
                    const terminal = $('#devTerminal');
                    terminal.value += `${message.data.data}\n`;
                    terminal.scrollTop = terminal.scrollHeight;
                    break;
                }
            case 'debugReaction':
                $('#devTool').open = true;
                break;
            default:
                window.devmgr.dispatchMessage(message.data.command, message.data.data);
        }
    };
}

// Device Manager
class DeviceManager {
    constructor() {
        this.ioMap = [];
        this.ioRedirectMap = new Uint32Array(2048);
        this.msgMap = {};
        this.connectMap = {};
        this.onCommand('outb', data => {
            this.outb(data.port, data.data)
        });
    }
    on(port, callback) {
        this.ioMap[port & 0xFFFF] = callback;
        this.ioRedirectMap[port >> 5] |= (1 << (port & 31));
    }
    onCommand(command, callback) {
        this.msgMap[command] = callback;
    }
    onConnect(name, data) {
        this.connectMap[name] = data;
    }
    outb(port, data) {
        try {
            const handler = this.ioMap[port & 0xFFFF];
            if (handler) {
                handler(port, data | 0);
            } else {
                throw Error(`front_outb(): Unexpected port $0x${port.toString(16)}`);
            }
        } catch (e) {
            console.error('front_outb()', e);
        }
    }
    connect(map) {
        this.connectMap.ioRedirectMap = this.ioRedirectMap;
        return Object.assign(map, this.connectMap);
    }
    dispatchMessage(command, data) {
        const callback = this.msgMap[command];
        if (callback) {
            callback(data);
        } else {
            throw new Error(`Unknown command: ${command}`);
        }
    }
}
window.devmgr = new DeviceManager();

// i8254 Beep Sound Driver
class i8254Sound {
    constructor(devmgr) {
        this.audioContext = window.AudioContext || window.webkitAudioContext;
        if (!this.audioContext) return;
        this.context = null;
        this.src = null;

        $('#volumeControl').style.display = 'inline-block';
        $('#inputVolume').addEventListener('change', e => {
            this.adjustGain();
        });

        devmgr.onCommand('beep', data => this.sound(data));
    }
    createAudioContext() {
        this.context = new this.audioContext();
        this.context.createOscillator();
    }
    sound(value) {
        this.noteOff();
        if (value > 0) {
            this.noteOn(value);
        }
    }
    noteOn(freq) {
        // this.noteOff();

        this.gain = this.context.createGain();
        this.adjustGain();

        this.src = this.context.createOscillator();
        this.src.type = 'square';
        this.src.frequency.value = freq;
        this.src.connect(this.gain);
        this.gain.connect(this.context.destination);
        this.src.start(0);
    }
    noteOff() {
        if (this.src) {
            this.src.disconnect();
        }
        this.src = null;
        this.gain = null;
    }
    getGain() {
        const val = $('#inputVolume').value;
        return val * val / 200;
    }
    adjustGain() {
        if (this.gain) {
            this.gain.gain.value = this.getGain();
        }
    }
}

// Virtual MIDI Device
const PORT_NOT_SELECTED = -1;
class VirtualMidiDevice {
    constructor(devmgr, div) {
        if (!navigator.requestMIDIAccess) return;

        (function () {
            return new Promise(async (resolve, reject) => {
                let midi;
                try {
                    midi = await navigator.requestMIDIAccess({ sysex: true });
                } catch (e) { };
                if (!midi) {
                    midi = await navigator.requestMIDIAccess({ sysex: false });
                }
                if (midi) resolve(midi);
                else reject();
            });
        })().then((midi) => {
            this.midi = midi;

            this.selectedIndex = PORT_NOT_SELECTED;

            this.outputs = [];
            if (typeof midi.outputs === 'function') {
                const ot = midi.outputs();
                for (let i = 0; i < ot.length; i++) {
                    this.outputs.push(ot[i]);
                }
            } else {
                const ot = midi.outputs.values();
                for (let o = ot.next(); !o.done; o = ot.next()) {
                    this.outputs.push(o.value);
                }
            }
            if (this.outputs.length == 0) return;

            div.setAttribute('class', 'controlFrame');
            const label = document.createElement('label');
            label.appendChild(document.createTextNode(`\uD83C\uDFB9 MIDI Out: `));
            const select = document.createElement('select');
            select.setAttribute('id', 'midiSelector');
            {
                const option = document.createElement('option');
                option.setAttribute('value', PORT_NOT_SELECTED);
                // option.appendChild(document.createTextNode(''));
                select.appendChild(option);
            }
            for (let i = 0; i < this.outputs.length; i++) {
                const output = this.outputs[i];
                console.log('midi_out', output);
                let option = document.createElement('option');
                option.setAttribute('value', i);
                option.appendChild(document.createTextNode(output.name));
                select.appendChild(option);
            }
            label.appendChild(select);
            select.addEventListener('change', e => {
                this.selectedIndex = $('#midiSelector').value;
                $('#midiMode').innerText = '';
            });
            div.appendChild(label);

            div.appendChild(document.createTextNode(' '));
            const button1 = document.createElement('a');
            button1.setAttribute('class', 'buttonFace');
            button1.setAttribute('id', 'midiTest');
            button1.appendChild(document.createTextNode('Test'));
            div.appendChild(button1);
            button1.addEventListener('click', e => {
                this.midiTest();
            });

            div.appendChild(document.createTextNode(' '));
            const button2 = document.createElement('a');
            button2.setAttribute('class', 'buttonFace destructiveButton');
            button2.setAttribute('id', 'midiPanic');
            button2.appendChild(document.createTextNode('Panic'));
            div.appendChild(button2);
            button2.addEventListener('click', e => {
                this.midiPanic();
            });

            div.appendChild(document.createTextNode(' '));
            const span = document.createElement('span');
            span.setAttribute('id', 'midiMode');
            div.appendChild(span);

            devmgr.onCommand('midi', data => this.midiOut(data));
            devmgr.onConnect('midi', true);
        })
            .catch(reason => console.error(reason));
    }
    midiOut(messages) {
        if (this.selectedIndex != PORT_NOT_SELECTED) {
            if (messages[0] == 0xF0) {
                if (this.parseSysEx(messages)) {
                    this.outputs[this.selectedIndex].send(messages);
                }
            } else {
                this.outputs[this.selectedIndex].send(messages);
            }
        }
    }
    parseSysEx(sysex) {
        if (!(sysex.length > 0) || (sysex[0] != 0xF0)) throw new Error(`SysEx: Parse Error: ${sysex}`);
        if (!this.midi.sysexEnabled) return false;
        if (sysex.length >= 6
            && sysex[1] == 0x7E && sysex[2] == 0x7F && sysex[3] == 0x09) {
            switch (sysex[4]) {
                case 0x01: // F0 7E 7F 09 01 F7 GM System ON
                    console.log('midi_sysex', 'GM System ON');
                    $('#midiMode').innerText = 'GM';
                    break;
                case 0x02: // F0 7E 7F 09 02 F7 GM System OFF
                    console.log('midi_sysex', 'GM System OFF');
                    $('#midiMode').innerText = '';
                    break;
                case 0x03: // F0 7E 7F 09 03 F7 GM2 System ON
                    console.log('midi_sysex', 'GM2 System ON');
                    $('#midiMode').innerText = 'GM2';
                    break;
            }
        } else if (sysex.length >= 11
            && sysex[1] == 0x41 && sysex[3] == 0x42 && sysex[4] == 0x12) {
            if (sysex[5] == 0x40 && sysex[6] == 0x00 && sysex[7] == 0x7F && sysex[8] == 0x00) {
                // F0 41 10 42 12 40 00 7F 00 41 F7 GS Reset
                console.log('midi_sysex', 'GS Reset');
                $('#midiMode').innerText = 'GS';
            } else if (sysex[5] == 0x00 && sysex[6] == 0x00 && sysex[7] == 0x7F && sysex[8] == 0x00) {
                // F0,41,10,42,12,00,00,7F,00,01,F7 System Mode Set 1
                console.log('midi_sysex', 'System Mode Set 1 (GS)');
                $('#midiMode').innerText = 'GS';
            }
        } else if (sysex.length >= 9 && sysex[1] == 0x43 && sysex[3] == 0x4C) {
            if (sysex[4] == 0x00 && sysex[5] == 0x00 && sysex[6] == 0x7E && sysex[7] == 0x00) {
                // F0,43,10,4C,00,00,7E,00,F7 XG System ON
                console.log('midi_sysex', 'XG System ON');
                $('#midiMode').innerText = 'XG';
            }
        }
        return true;
    }
    midiTest() {
        if (this.selectedIndex != PORT_NOT_SELECTED) {
            const testNote = 69;
            this.midiOut([0x90, testNote, 40 + Math.random() * 80]);
            setTimeout(() => this.midiOut([0x90, testNote, 0]), 500);
        }
    }
    midiPanic() {
        if (this.selectedIndex != PORT_NOT_SELECTED) {
            this.outputs[this.selectedIndex].send([
                0xB0, 0x78, 0, 0xB1, 0x78, 0, 0xB2, 0x78, 0, 0xB3, 0x78, 0,
                0xB4, 0x78, 0, 0xB5, 0x78, 0, 0xB6, 0x78, 0, 0xB7, 0x78, 0,
                0xB8, 0x78, 0, 0xB9, 0x78, 0, 0xBA, 0x78, 0, 0xBB, 0x78, 0,
                0xBC, 0x78, 0, 0xBD, 0x78, 0, 0xBE, 0x78, 0, 0xBF, 0x78, 0,
            ]);
        }
    }
}

// Virtual Video Device
class VideoDevice {
    constructor(devmgr, dom, scale) {
        this.BLACK = 0xFF000000;
        this.WHITE = 0xFFFFFFFF;
        this.scale = scale;
        this.fontWidth = 8;
        this.fontHeight = 16;
        this.lineHeight = this.fontHeight + 4;
        this.pal16 = [
            '#000', '#009', '#090', '#099', '#900', '#909', '#990', '#CCC',
            '#999', '#00F', '#0F0', '#0FF', '#F00', '#F0F', '#FF0', '#FFF',];
        this.font = "15px/16px 'TerminalWebFont', 'Menlo', 'Monaco', 'Consolas', 'Courier New', 'Courier', monospace";
        this.cursor = 0xFFFF;
        this.pal = new Uint32Array(256);
        this.canvas = dom;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(scale, scale);
        this.res = [0, 0, 0, 0];
        this.mode = 0;

        this.updateFont();
        if (document.fonts) {
            document.fonts.ready.then(() => this.updateFont());
        }

        devmgr.onCommand('pal', e => {
            this.pal[e[0]] = 0xFF000000 | e[1];
            this.setNeedsRedraw();
        });
        devmgr.onCommand('vga_mode', e => {
            console.log('vga_mode', e);
            this.setMode(e);
        });
        devmgr.onCommand('vga', e => {
            if (this.grapihicsMode) {
                if (this.bpp == 1) {
                    if (this.grapihicsMode == 1) {
                        this.renderMode11(e);
                    } else {
                        this.renderModeCGA(e);
                    }
                } else {
                    this.renderMode13(e);
                }
            } else {
                this.renderMode03(e);
            }
        });
        devmgr.onCommand('vga_cursor', e => {
            this.updateCursor(e);
        });

        this.setMode({ dim: [640 * scale, 400 * scale], vdim: [640, 400], bpp: 8, mode: 1 });
        this.showProgress(0);
    }
    setMode(e) {
        const { ctx, fontWidth, fontHeight, scale } = this;
        const TOOLBAR_HEIGHT = 32;
        this.bpp = e.bpp;
        this.grapihicsMode = e.mode;
        this.dim = { width: e.dim[0], height: e.dim[1] };
        this.vdim = { width: e.vdim[0], height: e.vdim[1] };
        const { width, height } = this.dim;
        if (this.grapihicsMode) {
            this.gvram = ctx.createImageData(width, height);
            this.canvas.width = width;
            this.canvas.height = height;
            this.canvas.style.width = `${this.vdim.width}px`;
            this.canvas.style.height = `${this.vdim.height}px`;
        } else {
            this.cols = (width / fontWidth) | 0;
            this.rows = (height / fontHeight) | 0;
            this.tvram = new Uint32Array(this.cols * this.rows * 2);
            this.canvas.width = width * scale;
            this.canvas.height = height * scale;
            this.canvas.style.width = `${this.vdim.width}px`;
            this.canvas.style.height = `${this.vdim.height}px`;
        }
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (window.innerHeight < this.vdim.height + TOOLBAR_HEIGHT) {
            window.resizeBy(0, this.vdim.height + TOOLBAR_HEIGHT - window.innerHeight);
        }
    }
    showProgress(value) {
        const { ctx, scale } = this;
        const { width, height } = this.canvas;
        const pw = 160 * scale, ph = 12 * scale;
        const px = Math.floor((width - pw) / 2);
        const py = Math.floor((height - ph) * 23 / 25);
        if (value <= 0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(px, py, pw, ph);
        } else if (value < 1.0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(px, py, pw, ph);
            ctx.fillStyle = '#999';
            ctx.fillRect(px, py, pw * value, ph);
        } else {
            ctx.fillStyle = '#CCC';
            ctx.fillRect(px, py, pw, ph);
        }
        ctx.strokeStyle = '#FFF';
        ctx.strokeRect(px, py, pw, ph);
    }
    updateCursor(newCursor) {
        if (this.grapihicsMode == 0) {
            this.drawText(this.cursor, 0);
            this.cursor = newCursor;
            this.drawText(this.cursor, 1);
        }
    }
    updateFont() {
        const { fontWidth, fontHeight, lineHeight, scale } = this;

        // CP437 to Unicode
        const unicodeMap = [
            0x0000, 0x263A, 0x263B, 0x2665, 0x2666, 0x2663, 0x2660, 0x2022, 0x25D8, 0x25CB, 0x25D9, 0x2642, 0x2640, 0x266A, 0x266B, 0x263C,
            0x25BA, 0x25C4, 0x2195, 0x203C, 0x00B6, 0x00A7, 0x25AC, 0x21A8, 0x2191, 0x2193, 0x2192, 0x2190, 0x221F, 0x2194, 0x25B2, 0x25BC,
            0x0020, 0x0021, 0x0022, 0x0023, 0x0024, 0x0025, 0x0026, 0x0027, 0x0028, 0x0029, 0x002A, 0x002B, 0x002C, 0x002D, 0x002E, 0x002F,
            0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037, 0x0038, 0x0039, 0x003A, 0x003B, 0x003C, 0x003D, 0x003E, 0x003F,
            0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047, 0x0048, 0x0049, 0x004A, 0x004B, 0x004C, 0x004D, 0x004E, 0x004F,
            0x0050, 0x0051, 0x0052, 0x0053, 0x0054, 0x0055, 0x0056, 0x0057, 0x0058, 0x0059, 0x005A, 0x005B, 0x005C, 0x005D, 0x005E, 0x005F,
            0x0060, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067, 0x0068, 0x0069, 0x006A, 0x006B, 0x006C, 0x006D, 0x006E, 0x006F,
            0x0070, 0x0071, 0x0072, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077, 0x0078, 0x0079, 0x007A, 0x007B, 0x007C, 0x007D, 0x007E, 0x2302,
            0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x00E0, 0x00E5, 0x00E7, 0x00EA, 0x00EB, 0x00E8, 0x00EF, 0x00EE, 0x00EC, 0x00C4, 0x00C5,
            0x00C9, 0x00E6, 0x00C6, 0x00F4, 0x00F6, 0x00F2, 0x00FB, 0x00F9, 0x00FF, 0x00D6, 0x00DC, 0x00A2, 0x00A3, 0x00A5, 0x20A7, 0x0192,
            0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x00F1, 0x00D1, 0x00AA, 0x00BA, 0x00BF, 0x2310, 0x00AC, 0x00BD, 0x00BC, 0x00A1, 0x00AB, 0x00BB,
            0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255D, 0x255C, 0x255B, 0x2510,
            0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x255E, 0x255F, 0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x2567,
            0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256B, 0x256A, 0x2518, 0x250C, 0x2588, 0x2584, 0x258C, 0x2590, 0x2580,
            0x03B1, 0x00DF, 0x0393, 0x03C0, 0x03A3, 0x03C3, 0x00B5, 0x03C4, 0x03A6, 0x0398, 0x03A9, 0x03B4, 0x221E, 0x03C6, 0x03B5, 0x2229,
            0x2261, 0x00B1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00F7, 0x2248, 0x00B0, 0x2219, 0x00B7, 0x221A, 0x207F, 0x00B2, 0x25A0, 0x00A0,
        ];

        this.canvasBG = document.createElement('canvas');
        do {
            this.canvasBG.width = fontWidth * 16 * scale;
            this.canvasBG.height = fontHeight * scale;
            const ctx = this.canvasBG.getContext('2d');
            ctx.scale(scale, scale);
            for (let i = 0; i < 16; i++) {
                ctx.fillStyle = this.pal16[i];
                ctx.fillRect(i * fontWidth, 0, fontWidth, fontHeight);
            }
        } while (false);

        do {
            this.canvasFont = document.createElement('canvas');
            this.canvasFont.width = fontWidth * 256 * scale;
            this.canvasFont.height = lineHeight * 16 * scale;
            const ctx = this.canvasFont.getContext('2d');
            ctx.font = this.font;
            ctx.textBaseline = 'bottom';
            ctx.scale(scale, scale);
            for (let i = 0; i < 16; i++) {
                const cy = i * lineHeight + fontHeight;
                ctx.fillStyle = this.pal16[i];
                for (let j = 0; j < 256; j++) {
                    const cx = j * fontWidth;
                    ctx.clearRect(cx, i * lineHeight, fontWidth, fontHeight);
                    const uchar = String.fromCharCode(unicodeMap[j]);
                    ctx.fillText(uchar, cx, cy, fontWidth);
                }
            }
        } while (false);
    }
    setNeedsRedraw() {
        this.needs_redraw = 1;
    }
    drawText(at, cursor) {
        const wchar = this.tvram[at];
        const char = wchar & 0xFF;
        const attr = wchar >> 8;
        const { ctx, fontWidth, fontHeight, lineHeight, scale, cols, rows } = this;
        const x = at % cols;
        const y = (at / cols) | 0;
        const cx = x * fontWidth;
        const cy = y * fontHeight;
        const bgColor = attr >> 4;
        const fgColor = attr & 0xF;
        if (cursor) {
            ctx.drawImage(this.canvasBG, fgColor * fontWidth * scale, 0, fontWidth * scale, fontHeight * scale, cx * scale, cy * scale, fontWidth * scale, fontHeight * scale);
            ctx.drawImage(this.canvasFont, char * fontWidth * scale, bgColor * lineHeight * scale, fontWidth * scale, fontHeight * scale, cx * scale, cy * scale, fontWidth * scale, fontHeight * scale);
        } else {
            ctx.drawImage(this.canvasBG, bgColor * fontWidth * scale, 0, fontWidth * scale, fontHeight * scale, cx * scale, cy * scale, fontWidth * scale, fontHeight * scale);
            ctx.drawImage(this.canvasFont, char * fontWidth * scale, fgColor * lineHeight * scale, fontWidth * scale, fontHeight * scale, cx * scale, cy * scale, fontWidth * scale, fontHeight * scale);
        }
    }
    renderMode03(src) {
        const { ctx, fontWidth, fontHeight, lineHeight, scale, cols, rows } = this;
        const fontWS = fontWidth * scale;
        const fontHS = fontHeight * scale;
        const lineHS = lineHeight * scale;
        let p = 0, q = 0;
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++, q++, p += 2) {
                const char = src[p];
                const attr = src[p + 1];
                const wchar = char | (attr << 8);
                if (this.tvram[q] != wchar) {
                    this.tvram[q] = wchar;
                    const cx = j * fontWS;
                    const cy = i * fontHS;
                    const bgColor = attr >> 4;
                    const fgColor = attr & 0xF;
                    if (q === this.cursor) {
                        ctx.drawImage(this.canvasBG, fgColor * fontWS, 0, fontWS, fontHS, cx, cy, fontWS, fontHS);
                        ctx.drawImage(this.canvasFont, char * fontWS, bgColor * lineHS, fontWS, fontHS, cx, cy, fontWS, fontHS);
                    } else {
                        ctx.drawImage(this.canvasBG, bgColor * fontWS, 0, fontWS, fontHS, cx, cy, fontWS, fontHS);
                        ctx.drawImage(this.canvasFont, char * fontWS, fgColor * lineHS, fontWS, fontHS, cx, cy, fontWS, fontHS);
                    }
                }
            }
        }
    }
    renderMode13(src) {
        const { ctx, scale } = this;
        const { width, height } = this.canvas;
        const size = width * height;
        const image = this.gvram;
        let dst = new Uint32Array(image.data.buffer);
        for (let i = 0; i < size; i++) {
            dst[i] = this.pal[src[i]];
        }
        ctx.clearRect(0, 0, width, height);
        ctx.putImageData(image, 0, 0);
    }
    renderModeCGA(src) {
        const { ctx, scale, BLACK, WHITE } = this;
        const { width, height } = this.canvas;
        const w8 = width >> 3;
        const h1 = height >> 1;
        const image = this.gvram;
        let dst = new Uint32Array(image.data.buffer);
        let p = 0, q = 0;
        for (let i = 0; i < h1; i++) {
            let r = p + 0x2000;
            for (let j = 0; j < w8; j++) {
                const c = src[p++];
                for (let k = 128 | 0; k != 0; k >>= 1) {
                    dst[q++] = (c & k) ? WHITE : BLACK;
                }
            }
            for (let j = 0; j < w8; j++) {
                const c = src[r++];
                for (let k = 128 | 0; k != 0; k >>= 1) {
                    dst[q++] = (c & k) ? WHITE : BLACK;
                }
            }
        }
        ctx.clearRect(0, 0, width, height);
        ctx.putImageData(image, 0, 0);
    }
    renderMode11(src) {
        const { ctx, scale, BLACK, WHITE } = this;
        const { width, height } = this.canvas;
        const size = (width * height) >> 3;
        const image = this.gvram;
        let dst = new Uint32Array(image.data.buffer);
        let j = 0;
        for (let i = 0; i < size; i++) {
            const c = src[i];
            for (let k = 128 | 0; k != 0; k >>= 1) {
                dst[j++] = (c & k) ? WHITE : BLACK;
            }
        }
        ctx.clearRect(0, 0, width, height);
        ctx.putImageData(image, 0, 0);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.beep = new i8254Sound(window.devmgr);
    window.midi = new VirtualMidiDevice(window.devmgr, $('#cpMidi'));
    window.vga = new VideoDevice(window.devmgr, $('#canvasVGA'), Math.ceil(window.devicePixelRatio) | 1);
    window.vpad = new VirtualTrackPad(window.devmgr, $('#screen_container'), $('#vPadBtnL'), $('#vPadBtnR'), $('#terminal'), $('#virtualTrackpad'), $('#mouseFocusButton'));

    $('#click_to_start').addEventListener('click', e => {
        if (!window.WebAssembly) {
            alert("We are sorry, but WebAssembly is not supported.");
            return;
        }
        startEmu();
    });

    $('#buttonReset').addEventListener('click', e => {
        if (window.worker) {
            worker.postMessage({ command: 'reset', gen: parseInt($('#selCpuGen').value), br_mbr: $('#optionDebugMBR').checked });
            window.term.focus();
        }
    });

    $('#labelLocal').addEventListener('click', e => {
        $('#fileLocal').click();
    });
    const vfdAttach = (name, blob) => {
        $('#selDiskImage').value = "";
        $('#labelLocal').value = name.slice(1 + name.lastIndexOf('\\'));
        if (window.worker) {
            worker.postMessage({ command: 'attach', blob: blob });
        } else {
            window.attach = blob;
        }
    }
    $('#fileLocal').addEventListener('change', e => {
        const reader = new FileReader();
        reader.addEventListener('load', (e) => {
            vfdAttach($('#fileLocal').value, e.target.result);
        });
        reader.readAsArrayBuffer(e.target.files[0]);
    });
    $('#selDiskImage').addEventListener('change', e => {
        if (window.worker) {
            $('#labelLocal').value = '';
            loadDiskImage((blob) => {
                worker.postMessage({ command: 'attach', blob: blob });
            })
        }
    });

    $('html').addEventListener('dragover', e => {
        e.stopPropagation();
        e.preventDefault();
        $('#frameFD').classList.add('controlActive');
    }, false);
    $('html').addEventListener('dragleave', e => {
        e.stopPropagation();
        e.preventDefault();
        $('#frameFD').classList.remove('controlActive');
    }, false);
    $('html').addEventListener('drop', e => {
        e.stopPropagation();
        e.preventDefault();
        $('#frameFD').classList.remove('controlActive');
        const reader = new FileReader();
        const file = e.dataTransfer.files[0]
        reader.addEventListener('load', (e) => {
            vfdAttach(file.name, e.target.result);
        });
        reader.readAsArrayBuffer(file);
    }, false);

    $('#buttonDevCLS').addEventListener('click', e => {
        $('#devTerminal').value = '';
    });
    const debugCommand = cmdline => {
        if (window.worker) {
            worker.postMessage({ command: 'debug', cmdline: cmdline });
            $('#debugCmdline').value = '';
        }
    }
    $('#debugCmdline').addEventListener('keypress', e => {
        if (e.keyCode == 13) {
            e.preventDefault();
            debugCommand($('#debugCmdline').value);
        }
    });
    $('#debugEnter').addEventListener('click', e => {
        debugCommand($('#debugCmdline').value);
    });
    $('#buttonStep').addEventListener('click', e => {
        debugCommand('t');
    });

    $('#biosButton').addEventListener('click', e => {
        if (flipElement($('#screen_container'))) {
            $('#biosPanel').style.display = 'block';
        } else {
            $('#biosPanel').style.display = 'none';
        }
    });

    $('#optionNNI').addEventListener('change', e => {
        if (e.target.checked) {
            $('#canvasVGA').classList.add('nearest_neighbor');
        } else {
            $('#canvasVGA').classList.remove('nearest_neighbor');
        }
    });

});

class VirtualTrackPad {

    constructor(devmgr, dom, domL, domR, domTerm, domPad, domButton) {
        this.mouseDown = false;
        this.touchCoords = null;
        this.touchIdentifier = null;
        this.mouseEnabled = false;

        dom.addEventListener('click', (e) => {
            if (this.mouseEnabled) return;
            e.preventDefault();
            domTerm.focus();
        });

        dom.addEventListener('pointerenter', e => {
            if (!this.isPointerMouse(e)) return;
            e.preventDefault();
        });
        dom.addEventListener('pointerdown', e => {
            if (!this.isPointerMouse(e)) return;
            dom.requestPointerLock();
            this.sendButtonStateChanged(this.convertPointerButton(e), true);
            e.preventDefault();
        });
        dom.addEventListener('pointermove', e => {
            if (!this.isPointerMouse(e)) return;
            this.sendPointerChanged(this.getPointerMovements(e));
            e.preventDefault();
        });
        dom.addEventListener('pointerup', e => {
            if (!this.isPointerMouse(e)) return;
            this.sendButtonStateChanged(this.convertPointerButton(e), false);
            e.preventDefault();
        });
        dom.addEventListener('pointercancel', e => {
            if (!this.isPointerMouse(e)) return;
            e.preventDefault();
        });

        dom.addEventListener('touchstart', (e) => {
            if (!this.mouseEnabled) return;
            this.touchCoords = this.convertTouchEvent(e, true);
            e.preventDefault();
        }, false);
        dom.addEventListener('touchmove', (e) => {
            if (!this.mouseEnabled) return;
            this.sendPointerChanged(this.convertTouchCursor(this.convertTouchEvent(e)));
            e.preventDefault();
        }, false);
        dom.addEventListener('touchend', (e) => {
            this.touchCoords = null;
            this.touchIdentifier = null;
            if (!this.mouseEnabled) return;
            e.preventDefault();
        }, false);
        dom.addEventListener('touchcancel', (e) => {
            this.touchCoords = null;
            this.touchIdentifier = null;
            if (!this.mouseEnabled) return;
            e.preventDefault();
        }, false);

        domL.addEventListener('touchstart', (e) => {
            this.sendButtonStateChanged('L', true);
            e.preventDefault();
        }, false);
        domL.addEventListener('touchend', (e) => {
            this.sendButtonStateChanged('L', false);
            e.preventDefault();
        }, false);
        domL.addEventListener('touchcancel', (e) => {
            this.sendButtonStateChanged('L', false);
            e.preventDefault();
        }, false);

        domR.addEventListener('touchstart', (e) => {
            this.sendButtonStateChanged('R', true);
            e.preventDefault();
        }, false);
        domR.addEventListener('touchend', (e) => {
            this.sendButtonStateChanged('R', false);
            e.preventDefault();
        }, false);
        domR.addEventListener('touchcancel', (e) => {
            this.sendButtonStateChanged('R', false);
            e.preventDefault();
        }, false);

        devmgr.onCommand('mouse', args => {
            const enabled = args.enabled;
            this.mouseEnabled = enabled;
            try { dom.exitPointerLock(); } catch (e) { }
        });
    }
    isPointerMouse(e) {
        return this.mouseEnabled && e.pointerType === 'mouse'
    }
    sendPointerChanged(array) {
        if (window.worker && array) {
            worker.postMessage({ command: 'pointer', move: array });
        }
    }
    sendButtonStateChanged(button, pressed) {
        if (window.worker && button) {
            worker.postMessage({ command: 'pointer', button: button, pressed: pressed });
        }
    }
    getPointerMovements(e) {
        const ex = e.movementX | 0, ey = e.movementY | 0;
        return [ex, ey];
    }
    convertPointerButton(e) {
        return "LMR"[e.button];
    }
    convertTouchEvent(e, is_start = false) {
        const tr = e.target.getBoundingClientRect();
        if (is_start) {
            this.touchIdentifier = e.touches[0].identifier;
        }
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            if (t.identifier === this.touchIdentifier) {
                const ex = (t.clientX - tr.left) | 0;
                const ey = (t.clientY - tr.top) | 0;
                return { ex, ey };
            }
        }
        return undefined;
    }
    convertTouchCursor(coords) {
        if (coords) {
            const { ex, ey } = coords;
            if (this.touchCoords && (ex || ey)) {
                const retVal = [ex - this.touchCoords[0], ey - this.touchCoords[1]];
                this.touchCoords = [ex, ey];
                return retVal;
            }
        }
        return undefined;
    }

}
