import { expect } from 'chai';
import { API_ERROR_LIMIT, API_RETRY_INTERVAL, API_TIMEOUT } from './network-settings.js';

describe('network-settings', () => {
    it('begrenzt die API-Antwortzeit auf höchstens 5 Sekunden', () => {
        expect(API_TIMEOUT).to.be.greaterThan(0);
        expect(API_TIMEOUT).to.be.at.most(5000);
    });

    it('hat positive Werte für Fehlerlimit und Wiederholintervall', () => {
        expect(API_ERROR_LIMIT).to.be.greaterThan(0);
        expect(API_RETRY_INTERVAL).to.be.greaterThan(0);
    });
});
