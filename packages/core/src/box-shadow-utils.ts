export type BoxShadowLength = {
	readonly value: number;
	readonly unit: string;
};

export type EditableBoxShadow = {
	readonly offsetX: BoxShadowLength;
	readonly offsetY: BoxShadowLength;
	readonly blurRadius: BoxShadowLength;
	readonly spreadRadius: BoxShadowLength;
	readonly color: string | null;
	readonly inset: boolean;
};

export type EditableBoxShadowOverrides = {
	readonly offset?: string | null;
	readonly blurRadius?: number | null;
	readonly spreadRadius?: number | null;
	readonly color?: string | null;
	readonly inset?: boolean | null;
};

const cssLengthUnits = new Set([
	'px',
	'em',
	'rem',
	'ex',
	'ch',
	'cap',
	'ic',
	'lh',
	'rlh',
	'vw',
	'vh',
	'vi',
	'vb',
	'vmin',
	'vmax',
	'cm',
	'mm',
	'q',
	'in',
	'pc',
	'pt',
]);

const makeLength = (value: number, unit = 'px'): BoxShadowLength => ({
	value,
	unit,
});

export const createDefaultBoxShadow = (): EditableBoxShadow => ({
	offsetX: makeLength(0),
	offsetY: makeLength(0),
	blurRadius: makeLength(0),
	spreadRadius: makeLength(0),
	color: 'rgba(0, 0, 0, 0.5)',
	inset: false,
});

const splitTopLevel = (value: string, delimiter: string): string[] | null => {
	const result: string[] = [];
	let start = 0;
	let depth = 0;
	let quote: string | null = null;
	let escaped = false;

	for (let i = 0; i < value.length; i++) {
		const character = value[i];
		if (escaped) {
			escaped = false;
			continue;
		}

		if (character === '\\') {
			escaped = true;
			continue;
		}

		if (quote !== null) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === '(') {
			depth++;
		} else if (character === ')') {
			depth--;
			if (depth < 0) {
				return null;
			}
		} else if (character === delimiter && depth === 0) {
			result.push(value.slice(start, i).trim());
			start = i + 1;
		}
	}

	if (depth !== 0 || quote !== null || escaped) {
		return null;
	}

	result.push(value.slice(start).trim());
	return result;
};

const tokenizeShadow = (value: string): string[] | null => {
	const result: string[] = [];
	let start = -1;
	let depth = 0;
	let quote: string | null = null;
	let escaped = false;

	for (let i = 0; i < value.length; i++) {
		const character = value[i];
		if (escaped) {
			escaped = false;
			continue;
		}

		if (character === '\\') {
			escaped = true;
			continue;
		}

		if (quote !== null) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === '(') {
			depth++;
			continue;
		}

		if (character === ')') {
			depth--;
			if (depth < 0) {
				return null;
			}
			continue;
		}

		if (/\s/.test(character) && depth === 0) {
			if (start !== -1) {
				result.push(value.slice(start, i));
				start = -1;
			}
			continue;
		}

		if (start === -1) {
			start = i;
		}
	}

	if (depth !== 0 || quote !== null || escaped) {
		return null;
	}

	if (start !== -1) {
		result.push(value.slice(start));
	}

	return result;
};

const parseLength = (token: string): BoxShadowLength | null => {
	const match = token.match(/^([+-]?(?:\d+\.?\d*|\.\d+))([a-z]+)?$/i);
	if (!match) {
		return null;
	}

	const value = Number(match[1]);
	const unit = match[2]?.toLowerCase() ?? '';
	if (!Number.isFinite(value)) {
		return null;
	}

	if (unit === '') {
		return value === 0 ? makeLength(0) : null;
	}

	if (!cssLengthUnits.has(unit)) {
		return null;
	}

	return makeLength(value, unit);
};

const parseShadowOffset = (
	value: string,
): Pick<EditableBoxShadow, 'offsetX' | 'offsetY'> | null => {
	const tokens = tokenizeShadow(value);
	if (tokens?.length !== 2) {
		return null;
	}

	const offsetX = parseLength(tokens[0]);
	const offsetY = parseLength(tokens[1]);
	if (!offsetX || !offsetY) {
		return null;
	}

	return {offsetX, offsetY};
};

const parseShadow = (value: string): EditableBoxShadow | null => {
	const tokens = tokenizeShadow(value);
	if (!tokens || tokens.length === 0) {
		return null;
	}

	let inset = false;
	const remainingTokens: string[] = [];
	for (const token of tokens) {
		if (token.toLowerCase() === 'inset') {
			if (inset) {
				return null;
			}
			inset = true;
		} else {
			remainingTokens.push(token);
		}
	}

	const lengths: BoxShadowLength[] = [];
	const colors: string[] = [];
	for (const token of remainingTokens) {
		const length = parseLength(token);
		if (length) {
			lengths.push(length);
		} else {
			colors.push(token);
		}
	}

	if (
		lengths.length < 2 ||
		lengths.length > 4 ||
		colors.length > 1 ||
		(lengths[2] !== undefined && lengths[2].value < 0)
	) {
		return null;
	}

	return {
		offsetX: lengths[0],
		offsetY: lengths[1],
		blurRadius: lengths[2] ?? makeLength(0),
		spreadRadius: lengths[3] ?? makeLength(0),
		color: colors[0] ?? null,
		inset,
	};
};

export const parseEditableBoxShadow = (
	value: string,
): EditableBoxShadow | null => {
	const trimmed = value.trim();
	if (trimmed === '' || trimmed.toLowerCase() === 'none') {
		return null;
	}

	const shadows = splitTopLevel(trimmed, ',');
	if (!shadows || shadows.length !== 1 || shadows[0] === '') {
		return null;
	}

	return parseShadow(shadows[0]);
};

const serializeLength = ({value, unit}: BoxShadowLength): string => {
	const normalizedValue = Object.is(value, -0) ? 0 : value;
	return `${normalizedValue}${unit}`;
};

export const serializeEditableBoxShadowOffset = (
	shadow: EditableBoxShadow,
): string =>
	`${serializeLength(shadow.offsetX)} ${serializeLength(shadow.offsetY)}`;

export const serializeEditableBoxShadow = (
	shadow: EditableBoxShadow,
): string => {
	const components = [
		...(shadow.inset ? ['inset'] : []),
		serializeLength(shadow.offsetX),
		serializeLength(shadow.offsetY),
		serializeLength(shadow.blurRadius),
		serializeLength(shadow.spreadRadius),
		...(shadow.color === null ? [] : [shadow.color]),
	];

	return components.join(' ');
};

export const applyEditableBoxShadowOverrides = ({
	baseValue,
	overrides,
}: {
	readonly baseValue: string | undefined;
	readonly overrides: EditableBoxShadowOverrides | null;
}): string | undefined => {
	if (
		!overrides ||
		!Object.values(overrides).some(
			(value) => value !== null && value !== undefined,
		)
	) {
		return baseValue;
	}

	const parsedBase =
		typeof baseValue === 'string' ? parseEditableBoxShadow(baseValue) : null;
	const isUnsupportedBase =
		typeof baseValue === 'string' &&
		baseValue.trim() !== '' &&
		baseValue.trim().toLowerCase() !== 'none' &&
		parsedBase === null;
	if (isUnsupportedBase) {
		return baseValue;
	}

	const base = parsedBase ?? createDefaultBoxShadow();
	const parsedOffset =
		typeof overrides.offset === 'string'
			? parseShadowOffset(overrides.offset)
			: null;
	return serializeEditableBoxShadow({
		...base,
		offsetX: parsedOffset?.offsetX ?? base.offsetX,
		offsetY: parsedOffset?.offsetY ?? base.offsetY,
		blurRadius:
			typeof overrides.blurRadius === 'number'
				? {...base.blurRadius, value: overrides.blurRadius}
				: base.blurRadius,
		spreadRadius:
			typeof overrides.spreadRadius === 'number'
				? {...base.spreadRadius, value: overrides.spreadRadius}
				: base.spreadRadius,
		color: typeof overrides.color === 'string' ? overrides.color : base.color,
		inset: typeof overrides.inset === 'boolean' ? overrides.inset : base.inset,
	});
};
