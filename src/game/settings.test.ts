import {it,expect} from 'vitest';
import {parseSettings} from './settings';
it('restores only supported settings and clamps untrusted volume',()=>{expect(parseSettings({sound:false,volume:2,quality:'low',reducedMotion:true})).toEqual({sound:false,volume:1,quality:'low',reducedMotion:true});expect(parseSettings({volume:-5,quality:'ultra'}).volume).toBe(0)});
it('rejects malformed persisted settings without preventing game launch',()=>{expect(parseSettings(null).quality).toBe('high');expect(parseSettings({sound:'false',volume:'loud'}).sound).toBe(true);expect(parseSettings({volume:NaN}).volume).toBe(.55)});
