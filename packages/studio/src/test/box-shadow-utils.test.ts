import {expect, test} from 'bun:test';
import {Internals} from 'remotion';

const {
	applyEditableBoxShadowOverrides,
	createDefaultBoxShadow,
	parseEditableBoxShadow,
	serializeEditableBoxShadow,
	serializeEditableBoxShadowOffset,
} = Internals;

test('parses and serializes one shadow with nested color commas', () => {
	const value = 'inset 2px -3px 4px -1px rgba(20, 30, 40, 0.5)';
	const shadow = parseEditableBoxShadow(value);

	expect(shadow).toEqual({
		offsetX: {value: 2, unit: 'px'},
		offsetY: {value: -3, unit: 'px'},
		blurRadius: {value: 4, unit: 'px'},
		spreadRadius: {value: -1, unit: 'px'},
		color: 'rgba(20, 30, 40, 0.5)',
		inset: true,
	});
	if (shadow === null) {
		throw new Error('Expected one editable shadow');
	}
	expect(serializeEditableBoxShadow(shadow)).toBe(
		'inset 2px -3px 4px -1px rgba(20, 30, 40, 0.5)',
	);
});

test('supports omitted color, no shadow, and an editable default', () => {
	expect(parseEditableBoxShadow('none')).toBeNull();
	expect(parseEditableBoxShadow('')).toBeNull();
	expect(parseEditableBoxShadow('1rem 2rem')).toEqual({
		offsetX: {value: 1, unit: 'rem'},
		offsetY: {value: 2, unit: 'rem'},
		blurRadius: {value: 0, unit: 'px'},
		spreadRadius: {value: 0, unit: 'px'},
		color: null,
		inset: false,
	});
	expect(serializeEditableBoxShadow(createDefaultBoxShadow())).toBe(
		'0px 0px 0px 0px rgba(0, 0, 0, 0.5)',
	);
	expect(
		serializeEditableBoxShadowOffset({
			...createDefaultBoxShadow(),
			offsetX: {value: 1, unit: 'rem'},
			offsetY: {value: 2, unit: 'em'},
		}),
	).toBe('1rem 2em');
});

test('does not rewrite shadow values the controls cannot safely parse', () => {
	expect(parseEditableBoxShadow('calc(1px + 2px) 4px red')).toBeNull();
	expect(parseEditableBoxShadow('1px 2px red,')).toBeNull();
	expect(parseEditableBoxShadow('1px 2px red, 0 4px blue')).toBeNull();
	expect(parseEditableBoxShadow('1px 2px -3px red')).toBeNull();
});

test('applies per-property overrides while preserving the other CSS values', () => {
	expect(
		applyEditableBoxShadowOverrides({
			baseValue: '2em 3em 4em 1em rgba(20, 30, 40, 0.5)',
			overrides: {offset: '8em 9em', inset: true},
		}),
	).toBe('inset 8em 9em 4em 1em rgba(20, 30, 40, 0.5)');
	expect(
		applyEditableBoxShadowOverrides({
			baseValue: '1px 2px red, 0 4px blue',
			overrides: null,
		}),
	).toBe('1px 2px red, 0 4px blue');
	expect(
		applyEditableBoxShadowOverrides({
			baseValue: 'calc(1px + 2px) 4px red',
			overrides: {offset: '8px 9px'},
		}),
	).toBe('calc(1px + 2px) 4px red');
});
