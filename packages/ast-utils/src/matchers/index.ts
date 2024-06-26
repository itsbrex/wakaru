import type { ASTNode, BigIntLiteral, BinaryExpression, BooleanLiteral, Identifier, JSCodeshift, MemberExpression, NullLiteral, NumericLiteral, RegExpLiteral, StringLiteral, TemplateLiteral, UnaryExpression } from 'jscodeshift'

export * from './isIIFE'
export * from './isFunctionExpression'

export function areNodesEqual(j: JSCodeshift, node1: ASTNode, node2: ASTNode): boolean {
    return j(node1).toSource() === j(node2).toSource()
}

/**
 * Check if node is a simple value.
 * Meaning it's duplication won't cause any side effects.
 *
 * Includes:
 * - string
 * - number
 * - bigInt
 * - boolean
 * - undefined
 * - null
 *
 * Excludes:
 * - template literal (might contain other expressions)
 * - symbol ( Symbol() !== Symbol() )
 * - MemberExpression (might have side effects)
 * - CallExpression (might have side effects)
 */
export function isSimpleValue(j: JSCodeshift, node: ASTNode): node is StringLiteral | NumericLiteral | BooleanLiteral | NullLiteral | UnaryExpression | Identifier | BigIntLiteral {
    return (
        j.NullLiteral.check(node)
     || j.StringLiteral.check(node)
     || j.NumericLiteral.check(node)
     || isUndefined(j, node)
     || isLooseBoolean(j, node)
     || j.BigIntLiteral.check(node)
    )
}

/**
 * Check if node is a loose boolean-like value.
 * Includes:
 * - Boolean
 * - !0, !1 and all ![thing]
 */
export function isLooseBoolean(j: JSCodeshift, node: ASTNode): node is BooleanLiteral | UnaryExpression {
    return j.BooleanLiteral.check(node)
    || (j.UnaryExpression.check(node) && node.operator === '!')
}

/**
 * Check if node is `true` literal
 */
export function isTrue(j: JSCodeshift, node: ASTNode): node is BooleanLiteral {
    return j.BooleanLiteral.check(node) && node.value === true
}

/**
 * Check if node is `false` literal
 */
export function isFalse(j: JSCodeshift, node: ASTNode): node is BooleanLiteral {
    return j.BooleanLiteral.check(node) && node.value === false
}

export function isLooseTrue(j: JSCodeshift, node: ASTNode): node is BooleanLiteral | UnaryExpression {
    return isTrue(j, node) || (isLogicalNot(j, node) && j.NumericLiteral.check(node.argument) && node.argument.value === 0)
}

export function isLooseFalse(j: JSCodeshift, node: ASTNode): node is BooleanLiteral | UnaryExpression {
    return isFalse(j, node) || (isLogicalNot(j, node) && j.NumericLiteral.check(node.argument) && node.argument.value === 1)
}

/**
 * Check if node is `null` literal
 */
export function isNull(j: JSCodeshift, node: ASTNode): node is NullLiteral {
    return j.NullLiteral.check(node)
}

/**
 * Check if node is `undefined` identifier or `void 0`
 */
export function isUndefined(j: JSCodeshift, node: ASTNode) {
    return isVoid0(j, node)
    || (j.Identifier.check(node) && node.name === 'undefined')
}

/**
 * Check if node is `void 0`
 */
export function isVoid0(j: JSCodeshift, node: ASTNode) {
    return j.UnaryExpression.check(node) && node.operator === 'void' && j.NumericLiteral.check(node.argument) && node.argument.value === 0
}

export function isLogicalNot(j: JSCodeshift, node: ASTNode): node is UnaryExpression {
    return j.UnaryExpression.check(node) && node.operator === '!'
}

/**
 * Check if node is `value !== null` or `null !== value`
 */
export function isNotNullBinary(j: JSCodeshift, node: ASTNode): node is BinaryExpression {
    return j.BinaryExpression.check(node)
    && node.operator === '!=='
    && (isNull(j, node.left) || isNull(j, node.right))
}

/**
 * Check if node is `value === null` or `null === value`
 */
export function isNullBinary(j: JSCodeshift, node: ASTNode): node is BinaryExpression {
    return j.BinaryExpression.check(node)
    && node.operator === '==='
    && (isNull(j, node.left) || isNull(j, node.right))
}

export function isUndefinedBinary(j: JSCodeshift, node: ASTNode): node is BinaryExpression {
    return j.BinaryExpression.check(node)
    && node.operator === '==='
    && (isUndefined(j, node.left) || isUndefined(j, node.right))
}

export function isValueLiteral(j: JSCodeshift, node: ASTNode): node is StringLiteral | NumericLiteral | BooleanLiteral | NullLiteral | BigIntLiteral | RegExpLiteral | TemplateLiteral {
    return j.StringLiteral.check(node)
    || j.NumericLiteral.check(node)
    || j.BooleanLiteral.check(node)
    || j.NullLiteral.check(node)
    || j.BigIntLiteral.check(node)
    || j.RegExpLiteral.check(node)
    || j.TemplateLiteral.check(node)
}

export function isStringObjectProperty(j: JSCodeshift, node: ASTNode, name?: string): node is Identifier | StringLiteral {
    if (!name) return j.Identifier.check(node) || j.StringLiteral.check(node)

    return (j.Identifier.check(node) && node.name === name)
        || (j.StringLiteral.check(node) && node.value === name)
}

/**
 * Check if node is `exports` or `module.exports`
 */
export function isExportObject(j: JSCodeshift, node: ASTNode): node is MemberExpression | Identifier {
    return isExports(j, node) || isModuleExports(j, node)
}

/**
 * Check if node is `exports` identifier
 */
export function isExports(j: JSCodeshift, node: ASTNode): node is Identifier {
    return j.Identifier.check(node) && node.name === 'exports'
}

/**
 * Check if node is `module.exports` member expression
 */
export function isModuleExports(j: JSCodeshift, node: ASTNode): node is MemberExpression {
    return j.MemberExpression.check(node)
        && j.Identifier.check(node.object) && node.object.name === 'module'
        && j.Identifier.check(node.property) && node.property.name === 'exports'
}
