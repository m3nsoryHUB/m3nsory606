(function () {
    'use strict';

    const FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

    const PRESETS = {
        flat:       [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
        rock:       [ 5,  3,  2, -1, -2,  1,  3,  5,  6,  6],
        pop:        [-1,  2,  4,  5,  3,  0, -1, -1,  1,  2],
        jazz:       [ 3,  2,  1,  2, -1, -1,  0,  1,  2,  3],
        classical:  [ 4,  3,  2,  1, -1, -1,  0,  2,  3,  4],
        electronic: [ 5,  4,  1,  0, -2,  2,  1,  1,  4,  5],
        bass:       [ 8,  6,  4,  2,  0,  0,  0,  0,  0,  0],
        vocal:      [-2, -1,  0,  2,  4,  4,  3,  2,  0, -1],
    };

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';

    let audioCtx = null;
    let sourceNode = null;
    let analyser = null;
    let gainNode = null;
    const filters = [];

    const playlist = [];
    let currentIndex = -1;

    const els = {
        fileInput: document.getElementById('fileInput'),
        trackTitle: document.getElementById('trackTitle'),
        trackArtist: document.getElementById('trackArtist'),
        visualizer: document.getElementById('visualizer'),
        seekBar: document.getElementById('seekBar'),
        currentTime: document.getElementById('currentTime'),
        duration: document.getElementById('duration'),
        playBtn: document.getElementById('playBtn'),
        prevBtn: document.getElementById('prevBtn'),
        nextBtn: document.getElementById('nextBtn'),
        volumeBar: document.getElementById('volumeBar'),
        bands: document.getElementById('bands'),
        presetSelect: document.getElementById('presetSelect'),
        resetEq: document.getElementById('resetEq'),
        playlist: document.getElementById('playlist'),
    };

    function setupAudioGraph() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioCtx.createMediaElementSource(audio);

        FREQUENCIES.forEach((freq, idx) => {
            const filter = audioCtx.createBiquadFilter();
            if (idx === 0) {
                filter.type = 'lowshelf';
            } else if (idx === FREQUENCIES.length - 1) {
                filter.type = 'highshelf';
            } else {
                filter.type = 'peaking';
                filter.Q.value = 1.2;
            }
            filter.frequency.value = freq;
            filter.gain.value = 0;
            filters.push(filter);
        });

        gainNode = audioCtx.createGain();
        gainNode.gain.value = parseFloat(els.volumeBar.value);

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        let node = sourceNode;
        for (const f of filters) {
            node.connect(f);
            node = f;
        }
        node.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(audioCtx.destination);
    }

    function buildBands() {
        FREQUENCIES.forEach((freq, idx) => {
            const wrap = document.createElement('div');
            wrap.className = 'band';

            const value = document.createElement('div');
            value.className = 'band__value';
            value.textContent = '0 dB';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'band__slider';
            slider.min = '-12';
            slider.max = '12';
            slider.step = '0.5';
            slider.value = '0';
            slider.dataset.index = String(idx);
            slider.setAttribute('orient', 'vertical');

            const freqLabel = document.createElement('div');
            freqLabel.className = 'band__freq';
            freqLabel.textContent = freq >= 1000 ? (freq / 1000) + 'кГц' : freq + 'Гц';

            slider.addEventListener('input', () => {
                const gain = parseFloat(slider.value);
                value.textContent = (gain > 0 ? '+' : '') + gain.toFixed(1) + ' dB';
                if (filters[idx]) {
                    filters[idx].gain.value = gain;
                }
                els.presetSelect.value = matchPreset() || '';
            });

            wrap.appendChild(value);
            wrap.appendChild(slider);
            wrap.appendChild(freqLabel);
            els.bands.appendChild(wrap);
        });
    }

    function getBandValues() {
        return Array.from(els.bands.querySelectorAll('.band__slider'))
            .map(s => parseFloat(s.value));
    }

    function applyPreset(name) {
        const values = PRESETS[name];
        if (!values) return;
        const sliders = els.bands.querySelectorAll('.band__slider');
        sliders.forEach((slider, idx) => {
            slider.value = values[idx];
            slider.dispatchEvent(new Event('input'));
        });
        els.presetSelect.value = name;
    }

    function matchPreset() {
        const current = getBandValues();
        for (const [name, vals] of Object.entries(PRESETS)) {
            if (vals.every((v, i) => Math.abs(v - current[i]) < 0.01)) {
                return name;
            }
        }
        return '';
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function renderPlaylist() {
        els.playlist.innerHTML = '';
        if (playlist.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'playlist__empty';
            empty.textContent = 'Список пуст. Добавьте треки выше.';
            els.playlist.appendChild(empty);
            return;
        }
        playlist.forEach((track, idx) => {
            const li = document.createElement('li');
            if (idx === currentIndex) li.classList.add('active');

            const name = document.createElement('span');
            name.className = 'playlist__name';
            name.textContent = track.name;
            name.addEventListener('click', () => playIndex(idx));

            const remove = document.createElement('button');
            remove.className = 'playlist__remove';
            remove.type = 'button';
            remove.textContent = '✕';
            remove.title = 'Удалить';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                removeTrack(idx);
            });

            li.appendChild(name);
            li.appendChild(remove);
            els.playlist.appendChild(li);
        });
    }

    function addFiles(fileList) {
        const wasEmpty = playlist.length === 0;
        for (const file of fileList) {
            if (!file.type.startsWith('audio/')) continue;
            playlist.push({
                name: file.name.replace(/\.[^.]+$/, ''),
                url: URL.createObjectURL(file),
                file,
            });
        }
        renderPlaylist();
        if (wasEmpty && playlist.length > 0) {
            playIndex(0);
        }
    }

    function removeTrack(idx) {
        const wasCurrent = idx === currentIndex;
        URL.revokeObjectURL(playlist[idx].url);
        playlist.splice(idx, 1);
        if (wasCurrent) {
            audio.pause();
            if (playlist.length === 0) {
                currentIndex = -1;
                els.trackTitle.textContent = 'Трек не выбран';
                els.trackArtist.textContent = '—';
                audio.src = '';
            } else {
                if (currentIndex >= playlist.length) currentIndex = 0;
                playIndex(currentIndex);
                return;
            }
        } else if (idx < currentIndex) {
            currentIndex--;
        }
        renderPlaylist();
    }

    function playIndex(idx) {
        if (idx < 0 || idx >= playlist.length) return;
        setupAudioGraph();
        currentIndex = idx;
        const track = playlist[idx];
        audio.src = track.url;
        els.trackTitle.textContent = track.name;
        els.trackArtist.textContent = formatFileSize(track.file);
        audio.play().catch(err => console.warn('Playback failed:', err));
        renderPlaylist();
    }

    function formatFileSize(file) {
        if (!file) return '';
        const mb = file.size / (1024 * 1024);
        return mb.toFixed(2) + ' МБ';
    }

    function togglePlay() {
        if (currentIndex === -1 && playlist.length > 0) {
            playIndex(0);
            return;
        }
        if (!audio.src) return;
        setupAudioGraph();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    }

    function next() {
        if (playlist.length === 0) return;
        playIndex((currentIndex + 1) % playlist.length);
    }

    function prev() {
        if (playlist.length === 0) return;
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }
        playIndex((currentIndex - 1 + playlist.length) % playlist.length);
    }

    function drawVisualizer() {
        const canvas = els.visualizer;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        function resize() {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        }
        resize();
        window.addEventListener('resize', resize);

        function draw() {
            requestAnimationFrame(draw);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (!analyser) return;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            const barCount = 48;
            const step = Math.floor(bufferLength / barCount);
            const barWidth = canvas.width / barCount;
            const gap = barWidth * 0.2;

            for (let i = 0; i < barCount; i++) {
                let sum = 0;
                for (let j = 0; j < step; j++) {
                    sum += dataArray[i * step + j];
                }
                const v = (sum / step) / 255;
                const h = v * canvas.height * 0.9;
                const x = i * barWidth;
                const y = canvas.height - h;

                const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
                grad.addColorStop(0, '#34d1bf');
                grad.addColorStop(1, '#7b5cff');
                ctx.fillStyle = grad;
                ctx.fillRect(x + gap / 2, y, barWidth - gap, h);
            }
        }
        draw();
    }

    els.fileInput.addEventListener('change', (e) => {
        addFiles(e.target.files);
        e.target.value = '';
    });

    els.playBtn.addEventListener('click', togglePlay);
    els.nextBtn.addEventListener('click', next);
    els.prevBtn.addEventListener('click', prev);

    els.volumeBar.addEventListener('input', () => {
        const v = parseFloat(els.volumeBar.value);
        if (gainNode) gainNode.gain.value = v;
        audio.volume = v;
    });
    audio.volume = parseFloat(els.volumeBar.value);

    els.seekBar.addEventListener('input', () => {
        if (audio.duration) {
            audio.currentTime = (parseFloat(els.seekBar.value) / 100) * audio.duration;
        }
    });

    audio.addEventListener('timeupdate', () => {
        els.currentTime.textContent = formatTime(audio.currentTime);
        if (audio.duration) {
            els.seekBar.value = (audio.currentTime / audio.duration) * 100;
        }
    });

    audio.addEventListener('loadedmetadata', () => {
        els.duration.textContent = formatTime(audio.duration);
    });

    audio.addEventListener('play', () => {
        els.playBtn.textContent = '⏸';
        els.playBtn.title = 'Пауза';
    });

    audio.addEventListener('pause', () => {
        els.playBtn.textContent = '▶';
        els.playBtn.title = 'Воспроизвести';
    });

    audio.addEventListener('ended', next);

    els.presetSelect.addEventListener('change', (e) => {
        applyPreset(e.target.value);
    });

    els.resetEq.addEventListener('click', () => applyPreset('flat'));

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlay();
        } else if (e.code === 'ArrowRight' && e.shiftKey) {
            next();
        } else if (e.code === 'ArrowLeft' && e.shiftKey) {
            prev();
        }
    });

    buildBands();
    renderPlaylist();
    drawVisualizer();
})();
