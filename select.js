'use strict';

window.addEventListener('DOMContentLoaded', (e) => {
    const images = [
        { "path": "./bin/fdos.img", "label": "FreeDOS", "selected": true },
        { "path": "./bin/haribote.img", "label": "Haribote OS" },
        { "path": "./bin/osz.img", "label": "osz" },
    ];
    const select = document.body.querySelector('#selDiskImage');
    images.map(image => {
        let element = document.createElement('option');
        element.setAttribute('value', image.path);
        let label = document.createTextNode(image.label);
        element.appendChild(label);
        if (image.selected) {
            element.setAttribute('selected', 'selected');
        }
        select.appendChild(element);
    });
});
