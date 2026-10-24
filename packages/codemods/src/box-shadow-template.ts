import type {
	Expression,
	JSXAttribute,
	JSXOpeningElement,
	ObjectExpression,
	ObjectProperty,
	TemplateLiteral,
} from '@babel/types';
import type {ExpressionKind} from 'ast-types/lib/gen/kinds';
import * as recast from 'recast';
import {Internals} from 'remotion';

const b = recast.types.builders;

export type BoxShadowComponent =
	| 'offset'
	| 'blurRadius'
	| 'spreadRadius'
	| 'color'
	| 'inset';

export type BoxShadowTemplate = {
	readonly shadow: NonNullable<
		ReturnType<typeof Internals.parseEditableBoxShadow>
	>;
	readonly expressions: Partial<Record<BoxShadowComponent, Expression>>;
};

export const getBoxShadowComponentFromKey = (
	key: string,
): BoxShadowComponent | null => {
	if (!key.startsWith('boxShadow.')) {
		return null;
	}

	const component = key.slice('boxShadow.'.length);
	return component === 'offset' ||
		component === 'blurRadius' ||
		component === 'spreadRadius' ||
		component === 'color' ||
		component === 'inset'
		? component
		: null;
};

export const applyBoxShadowComponentOverride = ({
	shadow,
	component,
	value,
}: {
	shadow: BoxShadowTemplate['shadow'];
	component: BoxShadowComponent;
	value: string | number | boolean;
}): BoxShadowTemplate['shadow'] | null => {
	const valueWithOverride = Internals.applyEditableBoxShadowOverrides({
		baseValue: Internals.serializeEditableBoxShadow(shadow),
		overrides: {[component]: value},
	});

	return Internals.parseEditableBoxShadow(valueWithOverride ?? '');
};

const getObjectPropertyName = (property: ObjectProperty): string | null => {
	if (property.key.type === 'Identifier') {
		return property.key.name;
	}

	if (property.key.type === 'StringLiteral') {
		return property.key.value;
	}

	return null;
};

const getStyleAttribute = (node: JSXOpeningElement): JSXAttribute | undefined =>
	node.attributes.find(
		(attribute): attribute is JSXAttribute =>
			attribute.type === 'JSXAttribute' &&
			attribute.name.type === 'JSXIdentifier' &&
			attribute.name.name === 'style',
	);

export const getStyleBoxShadowExpression = (
	node: JSXOpeningElement,
): Expression | null => {
	const styleAttribute = getStyleAttribute(node);
	if (
		styleAttribute?.value?.type !== 'JSXExpressionContainer' ||
		styleAttribute.value.expression.type !== 'ObjectExpression'
	) {
		return null;
	}

	const styleObject = styleAttribute.value.expression as ObjectExpression;
	for (let index = styleObject.properties.length - 1; index >= 0; index--) {
		const property = styleObject.properties[index];
		if (
			property.type === 'ObjectProperty' &&
			getObjectPropertyName(property) === 'boxShadow'
		) {
			return property.value as Expression;
		}

		if (property.type === 'SpreadElement') {
			return null;
		}
	}

	return null;
};

const parseCssShadow = (value: string) => {
	if (value.trim() === '' || value.trim().toLowerCase() === 'none') {
		return Internals.createDefaultBoxShadow();
	}

	return Internals.parseEditableBoxShadow(value);
};

const getCallName = (expression: Expression): string | null => {
	if (expression.type !== 'CallExpression') {
		return null;
	}

	if (expression.callee.type === 'Identifier') {
		return expression.callee.name;
	}

	return null;
};

const getOutputType = (expression: Expression): string | null => {
	if (expression.type !== 'CallExpression') {
		return null;
	}

	for (const argument of expression.arguments) {
		if (argument.type !== 'ObjectExpression') {
			continue;
		}

		for (const property of argument.properties) {
			if (
				property.type === 'ObjectProperty' &&
				property.key.type === 'Identifier' &&
				property.key.name === 'outputType' &&
				property.value.type === 'StringLiteral'
			) {
				return property.value.value;
			}
		}
	}

	return null;
};

const getInsetTest = (expression: Expression): Expression | null => {
	if (
		expression.type === 'ConditionalExpression' &&
		expression.consequent.type === 'StringLiteral' &&
		expression.consequent.value === 'inset ' &&
		expression.alternate.type === 'StringLiteral' &&
		expression.alternate.value === ''
	) {
		return expression.test as Expression;
	}

	return null;
};

const getTemplateExpressionMarker = (
	expression: Expression,
	index: number,
): {
	readonly component: BoxShadowComponent | 'number' | null;
	readonly value: string;
} => {
	if (getInsetTest(expression)) {
		return {component: 'inset', value: 'inset '};
	}

	if (getCallName(expression) === 'interpolateColors') {
		return {
			component: 'color',
			value: `rgb(${(index % 250) + 1}, 0, 0)`,
		};
	}

	const marker = 910000 + index * 100;
	if (getOutputType(expression) === 'translate') {
		return {
			component: 'offset',
			value: `${marker}px ${marker + 1}px`,
		};
	}

	if (getCallName(expression) === 'interpolate') {
		return {component: 'number', value: String(marker)};
	}

	return {component: null, value: String(marker)};
};

const componentForNumberMarker = (
	shadow: NonNullable<ReturnType<typeof Internals.parseEditableBoxShadow>>,
	marker: number,
): BoxShadowComponent | null => {
	if (shadow.blurRadius.value === marker) {
		return 'blurRadius';
	}

	if (shadow.spreadRadius.value === marker) {
		return 'spreadRadius';
	}

	return null;
};

export const parseBoxShadowTemplate = (
	expression: Expression,
): BoxShadowTemplate | null => {
	if (expression.type === 'StringLiteral') {
		const parsedShadow = parseCssShadow(expression.value);
		return parsedShadow ? {shadow: parsedShadow, expressions: {}} : null;
	}

	if (expression.type !== 'TemplateLiteral') {
		return null;
	}

	const template = expression as TemplateLiteral;
	if (template.expressions.length === 0) {
		const parsedShadow = parseCssShadow(template.quasis[0].value.cooked ?? '');
		return parsedShadow ? {shadow: parsedShadow, expressions: {}} : null;
	}

	const markers = template.expressions.map((templateExpression, index) =>
		getTemplateExpressionMarker(templateExpression as Expression, index),
	);
	if (markers.some(({component}) => component === null)) {
		return null;
	}

	let cssValue = '';
	for (let index = 0; index < template.expressions.length; index++) {
		cssValue += template.quasis[index].value.cooked ?? '';
		cssValue += markers[index].value;
	}

	cssValue += template.quasis[template.quasis.length - 1].value.cooked ?? '';

	const shadow = parseCssShadow(cssValue);
	if (!shadow) {
		return null;
	}

	const expressions: Partial<Record<BoxShadowComponent, Expression>> = {};
	for (let index = 0; index < template.expressions.length; index++) {
		const marker = markers[index];
		const component =
			marker.component === 'number'
				? componentForNumberMarker(shadow, 910000 + index * 100)
				: marker.component;
		if (!component || expressions[component]) {
			return null;
		}

		expressions[component] =
			component === 'inset'
				? (getInsetTest(
						template.expressions[index] as Expression,
					) as Expression)
				: (template.expressions[index] as Expression);
	}

	return {shadow, expressions};
};

export const setStyleBoxShadowExpression = (
	node: JSXOpeningElement,
	expression: ExpressionKind,
): boolean => {
	const styleAttribute = getStyleAttribute(node);
	if (!styleAttribute) {
		const createdStyleObject = b.objectExpression([
			b.objectProperty(b.identifier('boxShadow'), expression as never) as never,
		]);
		node.attributes.push(
			b.jsxAttribute(
				b.jsxIdentifier('style'),
				b.jsxExpressionContainer(createdStyleObject),
			) as JSXAttribute,
		);
		return true;
	}

	if (
		styleAttribute.value?.type !== 'JSXExpressionContainer' ||
		styleAttribute.value.expression.type !== 'ObjectExpression'
	) {
		return false;
	}

	const styleObject = styleAttribute.value.expression as ObjectExpression;
	for (let index = styleObject.properties.length - 1; index >= 0; index--) {
		const property = styleObject.properties[index];
		if (
			property.type === 'ObjectProperty' &&
			getObjectPropertyName(property) === 'boxShadow'
		) {
			property.value = expression as ObjectProperty['value'];
			return true;
		}

		if (property.type === 'SpreadElement') {
			break;
		}
	}

	styleObject.properties.push(
		b.objectProperty(
			b.identifier('boxShadow'),
			expression as never,
		) as unknown as ObjectProperty,
	);
	return true;
};

export const getBoxShadowComponentValue = (
	shadow: NonNullable<ReturnType<typeof Internals.parseEditableBoxShadow>>,
	component: BoxShadowComponent,
): string | number | boolean => {
	switch (component) {
		case 'offset':
			return Internals.serializeEditableBoxShadowOffset(shadow);
		case 'blurRadius':
			return shadow.blurRadius.value;
		case 'spreadRadius':
			return shadow.spreadRadius.value;
		case 'color':
			return shadow.color ?? 'rgba(0, 0, 0, 0.5)';
		case 'inset':
			return shadow.inset;
		default:
			throw new Error(`Unsupported box shadow component: ${component}`);
	}
};

const templateElement = (value: string, tail: boolean) =>
	b.templateElement({raw: value, cooked: value}, tail);

export const serializeBoxShadowTemplate = (
	shadow: NonNullable<ReturnType<typeof Internals.parseEditableBoxShadow>>,
	expressions: Partial<Record<BoxShadowComponent, Expression>>,
): ExpressionKind => {
	if (Object.keys(expressions).length === 0) {
		return b.stringLiteral(Internals.serializeEditableBoxShadow(shadow));
	}

	const quasis: string[] = [];
	const expressionNodes: Expression[] = [];
	let current = shadow.inset && !expressions.inset ? 'inset ' : '';
	const appendExpression = (expression: Expression, suffix: string) => {
		quasis.push(current);
		expressionNodes.push(expression);
		current = suffix;
	};

	if (expressions.inset) {
		appendExpression(
			b.conditionalExpression(
				expressions.inset as ExpressionKind,
				b.stringLiteral('inset '),
				b.stringLiteral(''),
			) as Expression,
			'',
		);
	}

	const offsetExpression = expressions.offset;
	if (offsetExpression) {
		appendExpression(offsetExpression, ' ');
	} else {
		current += `${shadow.offsetX.value}${shadow.offsetX.unit} ${shadow.offsetY.value}${shadow.offsetY.unit}`;
		current += ' ';
	}

	const blurExpression = expressions.blurRadius;
	if (blurExpression) {
		appendExpression(blurExpression, `${shadow.blurRadius.unit} `);
	} else {
		current += `${shadow.blurRadius.value}${shadow.blurRadius.unit} `;
	}

	const spreadExpression = expressions.spreadRadius;
	if (spreadExpression) {
		appendExpression(spreadExpression, `${shadow.spreadRadius.unit}`);
	} else {
		current += `${shadow.spreadRadius.value}${shadow.spreadRadius.unit}`;
	}

	if (shadow.color !== null || expressions.color) {
		current += ' ';
		const colorExpression = expressions.color;
		if (colorExpression) {
			appendExpression(colorExpression, '');
		} else {
			current += shadow.color;
		}
	}

	quasis.push(current);
	const templateExpressions = expressionNodes as ExpressionKind[];
	return b.templateLiteral(
		quasis.map((quasi, index) =>
			templateElement(quasi, index === quasis.length - 1),
		),
		templateExpressions,
	);
};
