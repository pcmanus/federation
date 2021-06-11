import {
  ASTNode,
  DefinitionNode,
  DirectiveDefinitionNode,
  DirectiveNode,
  DocumentNode,
  FieldDefinitionNode,
  GraphQLError,
  InputValueDefinitionNode,
  parse,
  SchemaDefinitionNode,
  Source,
  TypeNode,
  valueFromASTUntyped,
  ValueNode
} from "graphql";
import { assert } from "./utils";
import deepEqual from 'deep-equal';

export type QueryRoot = 'query';
export type MutationRoot = 'mutation';
export type SubscriptionRoot = 'subscription';
export type SchemaRoot = QueryRoot | MutationRoot | SubscriptionRoot;

export function defaultRootTypeName(root: SchemaRoot) {
  return root.charAt(0).toUpperCase() + root.slice(1);
}

type ImmutableWorld = {
  detached: never,
  schema: Schema,
  schemaDefinition: SchemaDefinition,
  schemaElement: SchemaElement,
  type: Type,
  namedType: NamedType,
  objectType: ObjectType,
  scalarType: ScalarType,
  unionType: UnionType,
  inputObjectType: InputObjectType,
  inputType: InputType,
  outputType: OutputType,
  wrapperType: WrapperType,
  listType: ListType<any>,
  fieldDefinition: FieldDefinition,
  fieldArgumentDefinition: ArgumentDefinition<FieldDefinition>,
  inputFieldDefinition: InputFieldDefinition,
  directiveDefinition: DirectiveDefinition,
  directiveArgumentDefinition: ArgumentDefinition<DirectiveDefinition>,
  directive: Directive
}

type MutableWorld = {
  detached: undefined,
  schema: MutableSchema,
  schemaDefinition: MutableSchemaDefinition,
  schemaElement: MutableSchemaElement,
  type: MutableType,
  namedType: MutableNamedType,
  objectType: MutableObjectType,
  scalarType: MutableScalarType,
  unionType: MutableUnionType,
  inputObjectType: MutableInputObjectType,
  inputType: MutableInputType,
  outputType: MutableOutputType,
  wrapperType: MutableWrapperType,
  listType: MutableListType<any>,
  fieldDefinition: MutableFieldDefinition,
  fieldArgumentDefinition: MutableArgumentDefinition<MutableFieldDefinition>,
  inputFieldDefinition: MutableInputFieldDefinition,
  directiveDefinition: MutableDirectiveDefinition
  directiveArgumentDefinition: MutableArgumentDefinition<MutableDirectiveDefinition>,
  directive: MutableDirective
}

type World = ImmutableWorld | MutableWorld;

export type Type = InputType | OutputType;
export type NamedType = ScalarType | ObjectType | UnionType | InputObjectType;
export type OutputType = ScalarType | ObjectType | UnionType | ListType<any>;
export type InputType = ScalarType | InputObjectType;
export type WrapperType = ListType<any>;

export type MutableType = MutableOutputType | MutableInputType;
export type MutableNamedType = MutableScalarType | MutableObjectType | MutableUnionType | MutableInputObjectType;
export type MutableOutputType = MutableScalarType | MutableObjectType | MutableUnionType | MutableListType<any>;
export type MutableInputType = MutableScalarType | MutableInputObjectType;
export type MutableWrapperType = MutableListType<any>;

// Those exists to make it a bit easier to write code that work on both mutable and immutable variants, if one so wishes.
export type AnySchema = Schema | MutableSchema;
export type AnySchemaElement = SchemaElement | MutableSchemaElement;
export type AnyType = AnyOutputType | AnyInputType;
export type AnyNamedType = AnyScalarType | AnyObjectType | AnyUnionType | AnyInputObjectType;
export type AnyOutputType = AnyScalarType | AnyObjectType | AnyUnionType | AnyListType;
export type AnyInputType = AnyScalarType | AnyInputObjectType;
export type AnyWrapperType = AnyListType;
export type AnyScalarType = ScalarType | MutableScalarType;
export type AnyObjectType = ObjectType | MutableObjectType;
export type AnyUnionType = UnionType | MutableUnionType;
export type AnyInputObjectType = InputObjectType | MutableInputObjectType;
export type AnyListType = ListType<any> | MutableListType<any>;

export type AnySchemaDefinition = SchemaDefinition | MutableSchemaDefinition;
export type AnyDirectiveDefinition = DirectiveDefinition | MutableDirectiveDefinition;
export type AnyDirective = Directive | MutableDirective;
export type AnyFieldDefinition = FieldDefinition | MutableFieldDefinition;
export type AnyInputFieldDefinition = InputFieldDefinition | MutableInputFieldDefinition;
export type AnyFieldArgumentDefinition = ArgumentDefinition<FieldDefinition> | MutableArgumentDefinition<MutableFieldDefinition>;
export type AnyDirectiveArgumentDefinition = ArgumentDefinition<DirectiveDefinition> | MutableArgumentDefinition<MutableDirectiveDefinition>;
export type AnyArgumentDefinition = AnyFieldDefinition | AnyDirectiveDefinition;

const builtInTypes = [ 'Int', 'Float', 'String', 'Boolean', 'ID' ];
const builtInDirectives = [ 'include', 'skip', 'deprecated', 'specifiedBy' ];

export function isNamedType<W extends World>(type: W['type']): type is W['namedType'] {
  return type instanceof BaseNamedType;
}

export function isWrapperType<W extends World>(type: W['type']): type is W['wrapperType'] {
  return type.kind == 'ListType';
}

export function isBuiltInType<W extends World>(type: W['namedType']): boolean {
  return builtInTypes.includes(type.name);
}

export function isBuiltInDirective<W extends World>(directive: W['directiveDefinition']): boolean {
  return builtInDirectives.includes(directive.name);
}

export interface Named {
  readonly name: string;
}

function valueToString(v: any): string {
  return JSON.stringify(v);
}

function valueEquals(a: any, b: any): boolean {
  return deepEqual(a, b);
}

// TODO: make most of those a field since they are essentially a "property" of the element (schema() excluded maybe).
export interface SchemaElement<W extends World = ImmutableWorld> {
  coordinate(): string;
  schema(): W['schema'] | W['detached'];
  parent(): W['schemaElement'] | W['schema'] | W['detached'];
  source(): ASTNode | undefined;
  appliedDirectives(): readonly W['directive'][];
  appliedDirective(name: string): W['directive'][];
}

export interface MutableSchemaElement extends SchemaElement<MutableWorld> {
  remove(): MutableSchemaElement[];
}

abstract class BaseElement<P extends W['schemaElement']  | W['schema'], W extends World> implements SchemaElement<W> {
  protected readonly _appliedDirectives: W['directive'][] = [];

  constructor(
    protected _parent: P | W['detached'],
    protected _source?: ASTNode
  ) {}

  abstract coordinate(): string;

  schema(): W['schema'] | W['detached'] {
    if (this._parent == undefined) {
      return undefined;
    } else if ('kind' in this._parent && this._parent.kind == 'Schema') {
      return this._parent as W['schema'];
    } else {
      return (this._parent as W['schemaElement']).schema();
    }
  }

  parent(): P | W['detached'] {
    return this._parent;
  }

  setParent(parent: P) {
    assert(!this._parent, "Cannot set parent of a non-detached element");
    this._parent = parent;
  }

  source(): ASTNode | undefined {
    return this._source;
  }

  appliedDirectives(): readonly W['directive'][] {
    return this._appliedDirectives;
  }

  appliedDirective(name: string): W['directive'][] {
    return this._appliedDirectives.filter(d => d.name == name);
  }

  protected addAppliedDirective(directive: W['directive']): W['directive'] {
    // TODO: should we dedup directives applications with the same arguments?
    // TODO: also, should we reject directive applications for directives that are not declared (maybe do so in the Directive ctor
    // and add a link to the definition)? 
    this._appliedDirectives.push(directive);
    return directive;
  }

  protected removeTypeReference(_: W['namedType']): void {
  }
}

abstract class BaseNamedElement<P extends W['schemaElement']  | W['schema'], W extends World> extends BaseElement<P, W> implements Named {
  constructor(
    readonly name: string,
    parent: P | W['detached'],
    source?: ASTNode
  ) {
    super(parent, source);
  }
}

abstract class BaseNamedType<W extends World> extends BaseNamedElement<W['schema'], W> {
  protected readonly _referencers: Set<W['schemaElement']> = new Set();

  protected constructor(
    name: string,
    schema: W['schema'] | W['detached'],
    source?: ASTNode
  ) {
    super(name, schema, source);
  }

  coordinate(): string {
    return this.name;
  }

  *allChildrenElements(): Generator<W['schemaElement'], void, undefined> {
    // Overriden by those types that do have chidrens
  }

  private addReferencer(referencer: W['schemaElement']) {
    assert(referencer, 'Referencer should exists');
    this._referencers.add(referencer);
  }

  toString(): string {
    return this.name;
  }
}

class BaseSchema<W extends World> {
  private _schemaDefinition: W['schemaDefinition'] | undefined = undefined;
  protected readonly builtInTypes: Map<string, W['scalarType']> = new Map();
  protected readonly typesMap: Map<string, W['namedType']> = new Map();
  protected readonly directivesMap: Map<string, W['directiveDefinition'] & W['schemaElement']> = new Map();

  protected constructor() {}

  kind: 'Schema' = 'Schema';

  // Used only through cheating the type system.
  private setSchemaDefinition(schemaDefinition: W['schemaDefinition']) {
    this._schemaDefinition = schemaDefinition;
  }

  private setBuiltIn(name: string, type: W['scalarType']) {
    this.builtInTypes.set(name, type);
  }

  get schemaDefinition(): W['schemaDefinition'] {
    assert(this._schemaDefinition, "Badly constructed schema; doesn't have a schema definition");
    return this._schemaDefinition;
  }

  /**
   * A map of all the types defined on this schema _excluding_ the built-in types.
   */
  get types(): ReadonlyMap<string, W['namedType']> {
    return this.typesMap;
  }

  /**
   * The type of the provide name in this schema if one is defined or if it is the name of a built-in.
   */
  type(name: string): W['namedType'] | undefined {
    const type = this.typesMap.get(name);
    return type ? type : this.builtInTypes.get(name);
  }

  intType(): W['scalarType'] {
    return this.builtInTypes.get('Int')!;
  }

  floatType(): W['scalarType'] {
    return this.builtInTypes.get('Float')!;
  }

  stringType(): W['scalarType'] {
    return this.builtInTypes.get('String')!;
  }

  booleanType(): W['scalarType'] {
    return this.builtInTypes.get('Boolean')!;
  }

  idType(): W['scalarType'] {
    return this.builtInTypes.get('ID')!;
  }

  get directives(): ReadonlyMap<string, W['directiveDefinition'] & W['schemaElement']> {
    return this.directivesMap;
  }

  directive(name: string): W['directiveDefinition'] | undefined {
    return this.directivesMap.get(name);
  }

  *allSchemaElement(): Generator<W['schemaElement'], void, undefined> {
    if (this._schemaDefinition) {
      yield this._schemaDefinition;
    }
    for (const type of this.types.values()) {
      yield type;
      yield* type.allChildrenElements();
    }
    for (const directive of this.directives.values()) {
      yield directive;
      yield* directive.arguments().values();
    }
  }
}

export class Schema extends BaseSchema<ImmutableWorld> {
  // Note that because typescript typesystem is structural, we need Schema to some incompatible
  // properties in Schema that are not in MutableSchema (not having MutableSchema be a subclass
  // of Schema is not sufficient). This is the why of the 'mutable' field (the `toMutable` property
  // also achieve this in practice, but we could want to add a toMutable() to MutableSchema (that
  // just return `this`) for some reason, so the field is a bit clearer/safer).
  mutable: false = false;

  static parse(source: string | Source): Schema {
    return buildSchemaInternal(parse(source), Ctors.immutable);
  }

  toMutable(): MutableSchema {
    return copy(this, Ctors.mutable);
  }
}

export class MutableSchema extends BaseSchema<MutableWorld> {
  mutable: true = true;

  static empty(): MutableSchema {
    return Ctors.mutable.addSchemaDefinition(Ctors.mutable.schema());
  }

  static parse(source: string | Source): MutableSchema {
    return buildSchemaInternal(parse(source), Ctors.mutable);
  }

  private ensureTypeNotFound(name: string) {
    if (this.type(name)) {
      throw new GraphQLError(`Type ${name} already exists in this schema`);
    }
  }

  private addOrGetType(name: string, kind: string, adder: (n: string) => MutableNamedType) {
    // Note: we don't use `this.type(name)` so that `addOrGetScalarType` always throws when called
    // with the name of a scalar type.
    const existing = this.typesMap.get(name);
    if (existing) {
      if (existing.kind == kind) {
        return existing;
      }
      throw new GraphQLError(`Type ${name} already exists and is not an ${kind} (it is a ${existing.kind})`);
    }
    return adder(name);
  }

  private addType<T extends MutableNamedType>(name: string, ctor: (n: string) => T): T {
    this.ensureTypeNotFound(name);
    const newType = ctor(name);
    this.typesMap.set(newType.name, newType);
    return newType;
  }

  addOrGetObjectType(name: string): MutableObjectType {
    return this.addOrGetType(name, 'ObjectType', n => this.addObjectType(n)) as MutableObjectType;
  }

  addObjectType(name: string): MutableObjectType {
    return this.addType(name, n => Ctors.mutable.createObjectType(n, this));
  }

  addOrGetScalarType(name: string): MutableScalarType {
    return this.addOrGetType(name, 'ScalarType', n => this.addScalarType(n)) as MutableScalarType;
  }

  addScalarType(name: string): MutableScalarType {
    if (this.builtInTypes.has(name)) {
      throw new GraphQLError(`Cannot add scalar type of name ${name} as it is a built-in type`);
    }
    return this.addType(name, n => Ctors.mutable.createScalarType(n, this));
  }

  addDirective(directive: MutableDirectiveDefinition) {
    this.directivesMap.set(directive.name, directive);
  }

  toImmutable(): Schema {
    return copy(this, Ctors.immutable);
  }
}

export class SchemaDefinition<W extends World = ImmutableWorld> extends BaseElement<W['schema'], W>  {
  protected readonly rootsMap: Map<SchemaRoot, W['objectType']> = new Map();

  protected constructor(
    parent: W['schema'] | W['detached'],
    source?: ASTNode
  ) {
    super(parent, source);
  }

  coordinate(): string {
    return '';
  }

  kind: 'SchemaDefinition' = 'SchemaDefinition';

  get roots(): ReadonlyMap<SchemaRoot, W['objectType']> {
    return this.rootsMap;
  }

  root(rootType: SchemaRoot): W['objectType'] | undefined {
    return this.rootsMap.get(rootType);
  }

  protected removeTypeReference(toRemove: W['namedType']): void {
    for (const [root, type] of this.rootsMap) {
      if (type == toRemove) {
        this.rootsMap.delete(root);
      }
    }
  }

  toString() {
    return `schema[${[...this.rootsMap.keys()].join(', ')}]`;
  }
}

export class MutableSchemaDefinition extends SchemaDefinition<MutableWorld> implements MutableSchemaElement {
  setRoot(rootType: SchemaRoot, objectType: MutableObjectType): MutableObjectType {
    if (objectType.schema() != this.schema()) {
      const attachement = objectType.schema() ? 'attached to another schema' : 'detached';
      throw new GraphQLError(`Cannot use provided type ${objectType} for ${rootType} as it is not attached to this schema (it is ${attachement})`);
    }
    this.rootsMap.set(rootType, objectType);
    return objectType;
  }

  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  remove(): MutableSchemaElement[] {
    throw new Error('TODO');
  }
}

export class ScalarType<W extends World = ImmutableWorld> extends BaseNamedType<W> {
  kind: 'ScalarType' = 'ScalarType';

  protected removeTypeReference(_: W['namedType']): void {
    assert(false, "Scalar types can never reference other types");
  }
}

export class MutableScalarType extends ScalarType<MutableWorld> implements MutableSchemaElement {
  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    if (builtInTypes.includes(this.name)) {
      throw Error(`Cannot apply directive to built-in type ${this.name}`);
    }
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  /**
   * Removes this type definition from its parent schema.
   *
   * After calling this method, this type will be "detached": it wil have no parent, schema, fields,
   * values, directives, etc...
   *
   * Note that it is always allowed to remove a type, but this may make a valid schema
   * invalid, and in particular any element that references this type will, after this call, have an undefined
   * reference.
   *
   * @returns an array of all the elements in the schema of this type (before the removal) that were
   * referening this type (and have thus now an undefined reference).
   */
  remove(): MutableSchemaElement[] {
    if (!this._parent) {
      return [];
    }
    removeTypeDefinition(this, this._parent);
    this._parent = undefined;
    for (const directive of this._appliedDirectives) {
      directive.remove();
    }
    const toReturn = [... this._referencers].map(r => {
      BaseElement.prototype['removeTypeReference'].call(r, this);
      return r;
    });
    this._referencers.clear();
    return toReturn;
  }
}

export class ObjectType<W extends World = ImmutableWorld> extends BaseNamedType<W> {
  protected readonly fieldsMap: Map<string, W['fieldDefinition']> = new Map();

  protected constructor(
    name: string,
    schema: W['schema'] | undefined,
    source?: ASTNode
  ) {
    super(name, schema, source);
  }

  kind: 'ObjectType' = 'ObjectType';

  get fields(): ReadonlyMap<string, W['fieldDefinition']> {
    return this.fieldsMap;
  }

  field(name: string): W['fieldDefinition'] | undefined {
    return this.fieldsMap.get(name);
  }

  *allChildrenElements(): Generator<W['schemaElement'], void, undefined> {
    for (const field of this.fieldsMap.values()) {
      yield field;
      yield* field.arguments().values();
    }
  }

  protected removeTypeReference(_: W['namedType']): void {
    assert(false, "Object types can never reference other types directly (their field does)");
  }
}

export class MutableObjectType extends ObjectType<MutableWorld> implements MutableSchemaElement {
  addField(name: string, type: MutableOutputType): MutableFieldDefinition {
    if (this.field(name)) {
      throw new GraphQLError(`Field ${name} already exists in type ${this} (${this.field(name)})`);
    }
    if (type.schema() != this.schema()) {
      const attachement = type.schema() ? 'attached to another schema' : 'detached';
      throw new GraphQLError(`Cannot use provided type ${type} as it is not attached to this schema (it is ${attachement})`);
    }
    const field = Ctors.mutable.createFieldDefinition(name, this, type);
    this.fieldsMap.set(name, field);
    return field;
  }

  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  /**
   * Removes this type definition from its parent schema.
   *
   * After calling this method, this type will be "detached": it wil have no parent, schema, fields,
   * values, directives, etc...
   *
   * Note that it is always allowed to remove a type, but this may make a valid schema
   * invalid, and in particular any element that references this type will, after this call, have an undefined
   * reference.
   *
   * @returns an array of all the elements in the schema of this type (before the removal) that were
   * referening this type (and have thus now an undefined reference).
   */
  remove(): MutableSchemaElement[] {
    if (!this._parent) {
      return [];
    }
    removeTypeDefinition(this, this._parent);
    this._parent = undefined;
    for (const directive of this._appliedDirectives) {
      directive.remove();
    }
    for (const field of this.fieldsMap.values()) {
      field.remove();
    }
    const toReturn = [... this._referencers].map(r => {
      BaseElement.prototype['removeTypeReference'].call(r, this);
      return r;
    });
    this._referencers.clear();
    return toReturn;
  }
}

export class UnionType<W extends World = ImmutableWorld> extends BaseNamedType<W> {
  protected readonly typesList: W['objectType'][] = [];

  protected constructor(
    name: string,
    schema: W['schema'] | W['detached'],
    source?: ASTNode
  ) {
    super(name, schema, source);
  }

  kind: 'UnionType' = 'UnionType';

  get types(): readonly W['objectType'][] {
    return this.typesList;
  }

  protected removeTypeReference(type: W['namedType']): void {
    const index = this.typesList.indexOf(type as W['objectType']);
    if (index >= 0) {
    this.typesList.splice(index, 1);
    }
  }
}

export class MutableUnionType extends UnionType<MutableWorld> implements MutableSchemaElement {
  addType(type: MutableObjectType): void {
    if (type.schema() != this.schema()) {
      const attachement = type.schema() ? 'attached to another schema' : 'detached';
      throw new GraphQLError(`Cannot add provided type ${type} to union ${this} as it is not attached to this schema (it is ${attachement})`);
    }
    if (!this.typesList.includes(type)) {
      this.typesList.push(type);
    }
  }

  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  /**
   * Removes this type definition from its parent schema.
   *
   * After calling this method, this type will be "detached": it wil have no parent, schema, fields,
   * values, directives, etc...
   *
   * Note that it is always allowed to remove a type, but this may make a valid schema
   * invalid, and in particular any element that references this type will, after this call, have an undefined
   * reference.
   *
   * @returns an array of all the elements in the schema of this type (before the removal) that were
   * referening this type (and have thus now an undefined reference).
   */
  remove(): MutableSchemaElement[] {
    if (!this._parent) {
      return [];
    }
    removeTypeDefinition(this, this._parent);
    this._parent = undefined;
    for (const directive of this._appliedDirectives) {
      directive.remove();
    }
    this.typesList.splice(0, this.typesList.length);
    const toReturn = [... this._referencers].map(r => {
      BaseElement.prototype['removeTypeReference'].call(r, this);
      return r;
    });
    this._referencers.clear();
    return toReturn;
  }
}

export class InputObjectType<W extends World = ImmutableWorld> extends BaseNamedType<W> {
  protected readonly fieldsMap: Map<string, W['inputFieldDefinition']> = new Map();

  protected constructor(
    name: string,
    schema: W['schema'] | undefined,
    source?: ASTNode
  ) {
    super(name, schema, source);
  }

  kind: 'InputObjectType' = 'InputObjectType';

  get fields(): ReadonlyMap<string, W['inputFieldDefinition']> {
    return this.fieldsMap;
  }

  field(name: string): W['inputFieldDefinition'] | undefined {
    return this.fieldsMap.get(name);
  }

  *allChildrenElements(): Generator<W['schemaElement'], void, undefined> {
    yield* this.fieldsMap.values();
  }

  protected removeTypeReference(_: W['namedType']): void {
    assert(false, "Input object types can never reference other types directly (their field does)");
  }
}

export class MutableInputObjectType extends InputObjectType<MutableWorld> implements MutableSchemaElement {
  addField(name: string, type: MutableInputType): MutableInputFieldDefinition {
    if (this.field(name)) {
      throw new GraphQLError(`Field ${name} already exists in type ${this} (${this.field(name)})`);
    }
    if (type.schema() != this.schema()) {
      const attachement = type.schema() ? 'attached to another schema' : 'detached';
      throw new GraphQLError(`Cannot use provided type ${type} as it is not attached to this schema (it is ${attachement})`);
    }
    const field = Ctors.mutable.createInputFieldDefinition(name, this, type);
    this.fieldsMap.set(name, field);
    return field;
  }

  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  /**
   * Removes this type definition from its parent schema.
   *
   * After calling this method, this type will be "detached": it wil have no parent, schema, fields,
   * values, directives, etc...
   *
   * Note that it is always allowed to remove a type, but this may make a valid schema
   * invalid, and in particular any element that references this type will, after this call, have an undefined
   * reference.
   *
   * @returns an array of all the elements in the schema of this type (before the removal) that were
   * referening this type (and have thus now an undefined reference).
   */
  remove(): MutableSchemaElement[] {
    if (!this._parent) {
      return [];
    }
    removeTypeDefinition(this, this._parent);
    this._parent = undefined;
    for (const directive of this._appliedDirectives) {
      directive.remove();
    }
    for (const field of this.fieldsMap.values()) {
      field.remove();
    }
    const toReturn = [... this._referencers].map(r => {
      BaseElement.prototype['removeTypeReference'].call(r, this);
      return r;
    });
    this._referencers.clear();
    return toReturn;
  }
}

export class ListType<T extends W['type'], W extends World = ImmutableWorld> {
  protected constructor(protected _type: T) {}

  kind: 'ListType' = 'ListType';

  schema(): W['schema'] {
    return this.baseType().schema() as W['schema'];
  }

  ofType(): T {
    return this._type;
  }

  baseType(): W['namedType'] {
    return isWrapperType(this._type) ? this._type.baseType() : this._type as W['namedType'];
  }

  toString(): string {
    return `[${this.ofType()}]`;
  }
}

export class MutableListType<T extends MutableType> extends ListType<T, MutableWorld> {}

export class FieldDefinition<W extends World = ImmutableWorld> extends BaseNamedElement<W['objectType'], W> {
  protected readonly _args: Map<string, W['fieldArgumentDefinition']> = new Map();

  protected constructor(
    name: string,
    parent: W['objectType'] | W['detached'],
    protected _type: W['outputType'] | W['detached'],
    source?: ASTNode
  ) {
    super(name, parent, source);
  }

  kind: 'FieldDefinition' = 'FieldDefinition';

  coordinate(): string {
    const parent = this.parent();
    return `${parent == undefined ? '<detached>' : parent.coordinate()}.${this.name}`;
  }

  type(): W['outputType'] | W['detached'] {
    return this._type;
  }

  arguments(): ReadonlyMap<string, W['fieldArgumentDefinition']> {
    return this._args;
  }

  argument(name: string): W['fieldArgumentDefinition'] | undefined {
    return this._args.get(name);
  }

  protected removeTypeReference(type: W['namedType']): void {
    if (this._type == type) {
      this._type = undefined;
    }
  }

  toString(): string {
    const args = this._args.size == 0
      ? "" 
      : '(' + [...this._args.values()].map(arg => arg.toString()).join(', ') + ')';
    return `${this.name}${args}: ${this.type()}`;
  }
}

export class MutableFieldDefinition extends FieldDefinition<MutableWorld> implements MutableSchemaElement {
  setType(type: MutableOutputType): MutableFieldDefinition {
    if (!this.schema()) {
      // Let's not allow manipulating detached elements too much as this could make our lives harder.
      throw new GraphQLError(`Cannot set the type of field ${this.name} as it is detached`);
    }
    if (type.schema() != this.schema()) {
      const attachement = type.schema() ? 'attached to another schema' : 'detached';
      throw new GraphQLError(`Cannot set provided type ${type} to field ${this.name} as it is not attached to this schema (it is ${attachement})`);
    }
    this._type = type;
    return this;
  }

  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  /**
   * Removes this field definition from its parent type.
   *
   * After calling this method, this field definition will be "detached": it wil have no parent, schema, type,
   * arguments or directives.
   */
  remove(): MutableSchemaElement[] {
    if (!this._parent) {
      return [];
    }
    (this._parent.fields as Map<string, MutableFieldDefinition>).delete(this.name);
    // We "clean" all the attributes of the object. This is because we mean detached element to be essentially
    // dead and meant to be GCed and this ensure we don't prevent that for no good reason.
    this._parent = undefined;
    this._type = undefined;
    for (const arg of this._args.values()) {
      arg.remove();
    }
    // Fields have nothing that can reference them outside of their parents
    return [];
  }
}

export class InputFieldDefinition<W extends World = ImmutableWorld> extends BaseNamedElement<W['inputObjectType'], W> {
  protected constructor(
    name: string,
    parent: W['inputObjectType'] | W['detached'],
    protected _type: W['inputType'] | W['detached'],
    source?: ASTNode
  ) {
    super(name, parent, source);
  }

  coordinate(): string {
    const parent = this.parent();
    return `${parent == undefined ? '<detached>' : parent.coordinate()}.${this.name}`;
  }

  kind: 'InputFieldDefinition' = 'InputFieldDefinition';

  type(): W['inputType'] | W['detached'] {
    return this._type;
  }

  protected removeTypeReference(type: W['namedType']): void {
    if (this._type == type) {
      this._type = undefined;
    }
  }

  toString(): string {
    return `${this.name}: ${this.type()}`;
  }
}

export class MutableInputFieldDefinition extends InputFieldDefinition<MutableWorld> implements MutableSchemaElement {
  setType(type: MutableInputType): MutableInputFieldDefinition {
    if (!this.schema()) {
      // Let's not allow manipulating detached elements too much as this could make our lives harder.
      throw new GraphQLError(`Cannot set the type of input field ${this.name} as it is detached`);
    }
    if (type.schema() != this.schema()) {
      const attachement = type.schema() ? 'attached to another schema' : 'detached';
      throw new GraphQLError(`Cannot set provided type ${type} to input field ${this.name} as it is not attached to this schema (it is ${attachement})`);
    }
    this._type = type;
    return this;
  }

  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  /**
   * Removes this field definition from its parent type.
   *
   * After calling this method, this field definition will be "detached": it wil have no parent, schema, type,
   * arguments or directives.
   */
  remove(): MutableSchemaElement[] {
    if (!this._parent) {
      return [];
    }
    (this._parent.fields as Map<string, MutableInputFieldDefinition>).delete(this.name);
    // We "clean" all the attributes of the object. This is because we mean detached element to be essentially
    // dead and meant to be GCed and this ensure we don't prevent that for no good reason.
    this._parent = undefined;
    this._type = undefined;
    // Fields have nothing that can reference them outside of their parents
    return [];
  }
}

export class ArgumentDefinition<P extends W['fieldDefinition'] | W['directiveDefinition'], W extends World = ImmutableWorld> extends BaseNamedElement<P, W> {
  protected constructor(
    name: string,
    parent: P | W['detached'],
    protected _type: W['inputType'] | W['detached'],
    protected _defaultValue: any,
    source?: ASTNode
  ) {
    super(name, parent, source);
  }

  kind: 'ArgumentDefinition' = 'ArgumentDefinition';

  coordinate(): string {
    const parent = this.parent();
    return `${parent == undefined ? '<detached>' : parent.coordinate()}(${this.name}:)`;
  }

  type(): W['inputType'] | W['detached'] {
    return this._type;
  }

  defaultValue(): any {
    return this._defaultValue;
  }

  protected removeTypeReference(type: W['namedType']): void {
    if (this._type == type) {
      this._type = undefined;
    }
  }

  toString() {
    const defaultStr = this._defaultValue == undefined ? "" : ` = ${this._defaultValue}`;
    return `${this.name}: ${this._type}${defaultStr}`;
  }
}

export class MutableArgumentDefinition<P extends MutableFieldDefinition | MutableDirectiveDefinition> extends ArgumentDefinition<P, MutableWorld> implements MutableSchemaElement {
  applyDirective(name: string, args?: Map<string, any>): MutableDirective {
    return this.addAppliedDirective(Ctors.mutable.createDirective(name, this, args ?? new Map()));
  }

  /**
   * Removes this argument definition from its parent element (field or directive).
   *
   * After calling this method, this argument definition will be "detached": it wil have no parent, schema, type,
   * default value or directives.
   */
  remove(): MutableSchemaElement[] {
    if (!this._parent) {
      return [];
    }
    (this._parent.arguments() as Map<string, any>).delete(this.name);
    // We "clean" all the attributes of the object. This is because we mean detached element to be essentially
    // dead and meant to be GCed and this ensure we don't prevent that for no good reason.
    this._parent = undefined;
    this._type = undefined;
    this._defaultValue = undefined;
    return [];
  }
}

export class DirectiveDefinition<W extends World = ImmutableWorld> extends BaseNamedElement<W['schema'], W> {
  protected readonly _args: Map<string, W['directiveArgumentDefinition']> = new Map();

  protected constructor(
    name: string,
    schema: W['schema'] | W['detached'],
    source?: ASTNode
  ) {
    super(name, schema, source);
  }

  kind: 'Directive' = 'Directive';

  coordinate(): string {
    throw new Error('TODO');
  }

  arguments(): ReadonlyMap<string, W['directiveArgumentDefinition']> {
    return this._args;
  }

  argument(name: string): W['directiveArgumentDefinition'] | undefined {
    return this._args.get(name);
  }

  protected removeTypeReference(_: W['namedType']): void {
    assert(false, "Directive definitions can never reference other types directly (their arguments might)");
  }

  toString(): string {
    return this.name;
  }
}

export class MutableDirectiveDefinition extends DirectiveDefinition<MutableWorld> implements MutableSchemaElement {
  addArgument(name: string, type: MutableInputType, defaultValue?: any): MutableArgumentDefinition<MutableDirectiveDefinition> {
    if (!this.schema()) {
      // Let's not allow manipulating detached elements too much as this could make our lives harder.
      throw new GraphQLError(`Cannot add argument to directive definition ${this.name} as it is detached`);
    }
    if (type.schema() != this.schema()) {
      const attachement = type.schema() ? 'attached to another schema' : 'detached';
      throw new GraphQLError(`Cannot use type ${type} for argument of directive definition ${this.name} as it is not attached to this schema (it is ${attachement})`);
    }
    const newArg = Ctors.mutable.createDirectiveArgumentDefinition(name, this, type, defaultValue);
    this._args.set(name, newArg);
    return newArg;
  }

  remove(): MutableSchemaElement[] {
    throw new Error('TODO');
  }
}

export class Directive<W extends World = ImmutableWorld> implements Named {
  protected constructor(
    readonly name: string,
    protected _parent: W['schemaElement'] | W['detached'],
    protected _args: Map<string, any>,
    readonly source?: ASTNode
  ) {
  }

  schema(): W['schema'] | W['detached'] {
    return this._parent?.schema();
  }

  parent(): W['schemaElement'] | W['detached'] {
    return this._parent;
  }

  definition(): W['directiveDefinition'] | W['detached'] {
    const doc = this.schema();
    return doc?.directive(this.name);
  }

  get arguments() : ReadonlyMap<string, any> {
    return this._args;
  }

  argument(name: string): any {
    return this._args.get(name);
  }

  matchArguments(expectedArgs: Map<string, any>): boolean {
    if (this._args.size !== expectedArgs.size) {
      return false;
    }
    for (var [key, val] of this._args) {
      const expectedVal = expectedArgs.get(key);
      // In cases of an undefined value, make sure the key actually exists on the object so there are no false positives
      if (!valueEquals(expectedVal, val) || (expectedVal === undefined && !expectedArgs.has(key))) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    const args = this._args.size == 0 ? '' : '(' + [...this._args.entries()].map(([n, v]) => `${n}: ${valueToString(v)}`).join(', ') + ')';
    return `@${this.name}${args}`;
  }
}

export class MutableDirective extends Directive<MutableWorld> {
  /**
   * Removes this directive application from its parent type.
   *
   * @returns whether the directive was actually removed, that is whether it had a parent.
   */
  remove(): boolean {
    if (!this._parent) {
      return false;
    }
    const parentDirectives = this._parent.appliedDirectives() as MutableDirective[];
    const index = parentDirectives.indexOf(this);
    assert(index >= 0, `Directive ${this} lists ${this._parent} as parent, but that parent doesn't list it as applied directive`);
    parentDirectives.splice(index, 1);
    this._parent = undefined;
    return true;
  }
}

class Ctors<W extends World> {
  // The definitions below are a hack to work around that typescript does not have "module" visibility for class constructors.
  // Meaning, we don't want the constructors below to be exposed (because it would be way too easy to break some of the class
  // invariants if using them, and more generally we don't want users to care about that level of detail), so all those ctors
  // are protected, but we still need to access them here, hence the `Function.prototype` hack.
  // Note: this is fairly well contained so manageable but certainly ugly and a bit error-prone, so if someone knowns a better way?
  static immutable = new Ctors<ImmutableWorld>(
    () => new (Function.prototype.bind.call(Schema, null)),
    (parent, source) => new (Function.prototype.bind.call(SchemaDefinition, null, parent, source)),
    (name, doc, source) => new (Function.prototype.bind.call(ScalarType, null, name, doc, source)),
    (name, doc, source) => new (Function.prototype.bind.call(ObjectType, null, name, doc, source)),
    (name, doc, source) => new (Function.prototype.bind.call(UnionType, null, name, doc, source)),
    (name, doc, source) => new (Function.prototype.bind.call(InputObjectType, null, name, doc, source)),
    (type) => new (Function.prototype.bind.call(ListType, null, type)),
    (name, parent, type, source) => new (Function.prototype.bind.call(FieldDefinition, null, name, parent, type, source)),
    (name, parent, type, source) => new (Function.prototype.bind.call(InputFieldDefinition, null, name, parent, type, source)),
    (name, parent, type, value, source) => new (Function.prototype.bind.call(ArgumentDefinition, null, name, parent, type, value, source)),
    (name, parent, type, value, source) => new (Function.prototype.bind.call(ArgumentDefinition, null, name, parent, type, value, source)),
    (name, parent, source) => new (Function.prototype.bind.call(DirectiveDefinition, null, name, parent, source)),
    (name, parent, args, source) => new (Function.prototype.bind.call(Directive, null, name, parent, args, source)),
    (v) => { 
      if (v == undefined)
        // TODO: Better error; maybe pass a string to include so the message is more helpful.
        throw new Error("Invalid detached value"); 
      return v;
    }
  );

  static mutable = new Ctors<MutableWorld>(
    () => new (Function.prototype.bind.call(MutableSchema, null)),
    (parent, source) => new (Function.prototype.bind.call(MutableSchemaDefinition, null, parent, source)),
    (name, doc,  source) => new (Function.prototype.bind.call(MutableScalarType, null, name, doc, source)),
    (name, doc, source) => new (Function.prototype.bind.call(MutableObjectType, null, name, doc, source)),
    (name, doc, source) => new (Function.prototype.bind.call(MutableUnionType, null, name, doc, source)),
    (name, doc, source) => new (Function.prototype.bind.call(MutableInputObjectType, null, name, doc, source)),
    (type) => new (Function.prototype.bind.call(MutableListType, null, type)),
    (name, parent, type, source) => new (Function.prototype.bind.call(MutableFieldDefinition, null, name, parent, type, source)),
    (name, parent, type, source) => new (Function.prototype.bind.call(MutableInputFieldDefinition, null, name, parent, type, source)),
    (name, parent, type, value, source) => new (Function.prototype.bind.call(MutableArgumentDefinition, null, name, parent, type, value, source)),
    (name, parent, type, value, source) => new (Function.prototype.bind.call(MutableArgumentDefinition, null, name, parent, type, value, source)),
    (name, parent, source) => new (Function.prototype.bind.call(MutableDirectiveDefinition, null, name, parent, source)),
    (name, parent, args, source) => new (Function.prototype.bind.call(MutableDirective, null, name, parent, args, source)),
    (v) => v
  );

  constructor(
    private readonly createSchema: () => W['schema'],
    private readonly createSchemaDefinition: (parent: W['schema'] | W['detached'], source?: ASTNode) => W['schemaDefinition'],
    readonly createScalarType: (name: string, schema: W['schema'] | W['detached'], source?: ASTNode) => W['scalarType'],
    readonly createObjectType: (name: string, schema: W['schema'] | W['detached'], source?: ASTNode) => W['objectType'],
    readonly createUnionType: (name: string, schema: W['schema'] | W['detached'], source?: ASTNode) => W['unionType'],
    readonly createInputObjectType: (name: string, schema: W['schema'] | W['detached'], source?: ASTNode) => W['inputObjectType'],
    readonly createList: <T extends W['type']>(type: T) => W['listType'],
    readonly createFieldDefinition: (name: string, parent: W['objectType'] | W['detached'], type: W['outputType'], source?: ASTNode) => W['fieldDefinition'],
    readonly createInputFieldDefinition: (name: string, parent: W['inputObjectType'] | W['detached'], type: W['inputType'], source?: ASTNode) => W['inputFieldDefinition'],
    readonly createFieldArgumentDefinition: (name: string, parent: W['fieldDefinition'] | W['detached'], type: W['inputType'], defaultValue: any, source?: ASTNode) => W['fieldArgumentDefinition'],
    readonly createDirectiveArgumentDefinition: (name: string, parent: W['directiveDefinition'] | W['detached'], type: W['inputType'], defaultValue: any, source?: ASTNode) => W['directiveArgumentDefinition'],
    readonly createDirectiveDefinition: (name: string, parent: W['schema'] | W['detached'], source?: ASTNode) => W['directiveDefinition'],
    readonly createDirective: (name: string, parent: W['schemaElement'] | W['detached'], args: Map<string, any>, source?: ASTNode) => W['directive'],
    readonly checkDetached: <T>(v: T | undefined) => T | W['detached']
  ) {
  }

  schema(): W['schema'] {
    const doc = this.createSchema();
    for (const builtIn of builtInTypes) {
      BaseSchema.prototype['setBuiltIn'].call(doc, builtIn, this.createScalarType(builtIn, doc));
    }
    return doc;
  }

  addSchemaDefinition(schema: W['schema'], source?: ASTNode): W['schema'] {
    const schemaDefinition = this.createSchemaDefinition(schema, source);
    BaseSchema.prototype['setSchemaDefinition'].call(schema, schemaDefinition);
    return schema;
  }

  createNamedType(kind: string, name: string, schema: W['schema'], source?: ASTNode): W['namedType'] {
    switch (kind) {
      case 'ScalarType':
        return this.createScalarType(name, schema, source);
      case 'ObjectType':
        return this.createObjectType(name, schema, source);
      case 'UnionType':
        return this.createUnionType(name, schema, source);
      case 'InputObjectType':
        return this.createInputObjectType(name, schema, source);
      default:
        assert(false, "Missing branch for type " + kind);
    }
  }
}

function addTypeDefinition<W extends World>(namedType: W['namedType'], schema: W['schema']) {
  (schema.types as Map<string, W['namedType']>).set(namedType.name, namedType);
}

function removeTypeDefinition<W extends World>(namedType: W['namedType'], schema: W['schema']) {
  (schema.types as Map<string, W['namedType']>).delete(namedType.name);
}

function addDirectiveDefinition<W extends World>(definition: W['directiveDefinition'], schema: W['schema']) {
  (schema.directives as Map<string, W['directiveDefinition']>).set(definition.name, definition);
}

function addRoot<W extends World>(root: SchemaRoot, typeName: string, schemaDefinition: W['schemaDefinition']) {
  const type = schemaDefinition.schema()!.type(typeName)! as W['objectType'];
  (schemaDefinition.roots as Map<SchemaRoot, W['objectType']>).set(root, type);
  addReferencerToType(schemaDefinition, type);
}

function addFieldArg<W extends World>(arg: W['fieldArgumentDefinition'], field: W['fieldDefinition']) {
  (field.arguments() as Map<string, W['fieldArgumentDefinition']>).set(arg.name, arg);
}

function addDirectiveArg<W extends World>(arg: W['directiveArgumentDefinition'], directive: W['directiveDefinition']) {
  (directive.arguments() as Map<string, W['directiveArgumentDefinition']>).set(arg.name, arg);
}

function addField<W extends World>(field: W['fieldDefinition'] | W['inputFieldDefinition'], objectType: W['objectType'] | W['inputObjectType']) {
  (objectType.fields as Map<string, W['fieldDefinition'] | W['inputFieldDefinition']>).set(field.name, field);
}

function addTypeToUnion<W extends World>(typeName: string, unionType: W['unionType']) {
  const type = unionType.schema()!.type(typeName)! as W['objectType'];
  (unionType.types as W['objectType'][]).push(type);
  addReferencerToType(unionType, type);
}

function addReferencerToType<W extends World>(referencer: W['schemaElement'], type: W['type']) {
  switch (type.kind) {
    case 'ListType':
      addReferencerToType(referencer, (type as W['listType']).baseType());
      break;
    default:
      BaseNamedType.prototype['addReferencer'].call(type, referencer);
      break;
  }
}

function buildValue(value?: ValueNode): any {
  // TODO: Should we rewrite a version of valueFromAST instead of using valueFromASTUntyped? Afaict, what we're missing out on is
  // 1) coercions, which concretely, means:
  //   - for enums, we get strings
  //   - for int, we don't get the validation that it should be a 32bit value.
  //   - for ID, which accepts strings and int, we don't get int converted to string.
  //   - for floats, we get either int or float, we don't get int converted to float.
  //   - we don't get any custom coercion (but neither is buildSchema in graphQL-js anyway).
  // 2) type validation. 
  return value ? valueFromASTUntyped(value) : undefined;
}

function buildSchemaInternal<W extends World>(documentNode: DocumentNode, ctors: Ctors<W>): W['schema'] {
  const doc = ctors.schema();
  buildNamedTypeShallow(documentNode, doc, ctors);
  for (const definitionNode of documentNode.definitions) {
    switch (definitionNode.kind) {
      case 'OperationDefinition':
      case 'FragmentDefinition':
        throw new GraphQLError("Invalid executable definition found while building schema", definitionNode);
      case 'SchemaDefinition':
        buildSchemaDefinition(definitionNode, doc, ctors);
        break;
      case 'ScalarTypeDefinition':
      case 'ObjectTypeDefinition':
      case 'InterfaceTypeDefinition':
      case 'UnionTypeDefinition':
      case 'EnumTypeDefinition':
      case 'InputObjectTypeDefinition':
        buildNamedTypeInner(definitionNode, doc.type(definitionNode.name.value)!, ctors);
        break;
      case 'DirectiveDefinition':
        addDirectiveDefinition(buildDirectiveDefinition(definitionNode, doc, ctors), doc);
        break;
      case 'SchemaExtension':
      case 'ScalarTypeExtension':
      case 'ObjectTypeExtension':
      case 'InterfaceTypeExtension':
      case 'UnionTypeExtension':
      case 'EnumTypeExtension':
      case 'InputObjectTypeExtension':
        throw new Error("Extensions are a TODO");
    }
  }
  return doc;
}

function buildNamedTypeShallow<W extends World>(documentNode: DocumentNode, schema: W['schema'], ctors: Ctors<W>) {
  for (const definitionNode of documentNode.definitions) {
    switch (definitionNode.kind) {
      case 'ScalarTypeDefinition':
      case 'ObjectTypeDefinition':
      case 'InterfaceTypeDefinition':
      case 'UnionTypeDefinition':
      case 'EnumTypeDefinition':
      case 'InputObjectTypeDefinition':
        addTypeDefinition(ctors.createNamedType(withoutTrailingDefinition(definitionNode.kind), definitionNode.name.value, schema, definitionNode), schema);
        break;
      case 'SchemaExtension':
      case 'ScalarTypeExtension':
      case 'ObjectTypeExtension':
      case 'InterfaceTypeExtension':
      case 'UnionTypeExtension':
      case 'EnumTypeExtension':
      case 'InputObjectTypeExtension':
        throw new Error("Extensions are a TODO");
    }
  }
}

type NodeWithDirectives = {directives?: ReadonlyArray<DirectiveNode>};

function withoutTrailingDefinition(str: string): string {
  return str.slice(0, str.length - 'Definition'.length);
}

function buildSchemaDefinition<W extends World>(schemaNode: SchemaDefinitionNode, schema: W['schema'], ctors: Ctors<W>) {
  ctors.addSchemaDefinition(schema, schemaNode);
  buildAppliedDirectives(schemaNode, schema.schemaDefinition, ctors);
  for (const opTypeNode of schemaNode.operationTypes) {
    addRoot(opTypeNode.operation, opTypeNode.type.name.value, schema.schemaDefinition);
  }
}

function buildAppliedDirectives<W extends World>(elementNode: NodeWithDirectives, element: W['schemaElement'], ctors: Ctors<W>) {
  for (const directive of elementNode.directives ?? []) {
    BaseElement.prototype['addAppliedDirective'].call(element, buildDirective(directive, element, ctors));
  }
}

function buildDirective<W extends World>(directiveNode: DirectiveNode, element: W['schemaElement'], ctors: Ctors<W>): W['directive'] {
  const args = new Map();
  for (const argNode of directiveNode.arguments ?? []) {
    args.set(argNode.name.value, buildValue(argNode.value));
  }
  return ctors.createDirective(directiveNode.name.value, element, args, directiveNode);
}

function buildNamedTypeInner<W extends World>(definitionNode: DefinitionNode & NodeWithDirectives, type: W['namedType'], ctors: Ctors<W>) {
  buildAppliedDirectives(definitionNode, type, ctors);
  switch (definitionNode.kind) {
    case 'ObjectTypeDefinition':
      const objectType = type as W['objectType'];
      for (const fieldNode of definitionNode.fields ?? []) {
        addField(buildFieldDefinition(fieldNode, objectType, ctors), objectType);
      }
      break;
    case 'InterfaceTypeDefinition':
      throw new Error("TODO");
    case 'UnionTypeDefinition':
      const unionType = type as W['unionType'];
      for (const namedType of definitionNode.types ?? []) {
        addTypeToUnion(namedType.name.value, unionType);
      }
      break;
    case 'EnumTypeDefinition':
      throw new Error("TODO");
    case 'InputObjectTypeDefinition':
      const inputObjectType = type as W['inputObjectType'];
      for (const fieldNode of definitionNode.fields ?? []) {
        addField(buildInputFieldDefinition(fieldNode, inputObjectType, ctors), inputObjectType);
      }
      break;
  }
}

function buildFieldDefinition<W extends World>(fieldNode: FieldDefinitionNode, parentType: W['objectType'], ctors: Ctors<W>): W['fieldDefinition'] {
  const type = buildWrapperTypeOrTypeRef(fieldNode.type, parentType.schema()!, ctors) as W['outputType'];
  const builtField = ctors.createFieldDefinition(fieldNode.name.value, parentType, type, fieldNode);
  buildAppliedDirectives(fieldNode, builtField, ctors);
  for (const inputValueDef of fieldNode.arguments ?? []) {
    addFieldArg(buildFieldArgumentDefinition(inputValueDef, builtField, ctors), builtField);
  }
  addReferencerToType(builtField, type);
  return builtField;
}

function buildWrapperTypeOrTypeRef<W extends World>(typeNode: TypeNode, schema: W['schema'], ctors: Ctors<W>): W['type'] {
  switch (typeNode.kind) {
    case 'ListType':
      return ctors.createList(buildWrapperTypeOrTypeRef(typeNode.type, schema, ctors));
    case 'NonNullType':
      throw new Error('TODO');
    default:
      return schema.type(typeNode.name.value)!;
  }
}

function buildFieldArgumentDefinition<W extends World>(inputNode: InputValueDefinitionNode, parent: W['fieldDefinition'], ctors: Ctors<W>): W['fieldArgumentDefinition'] {
  const type = buildWrapperTypeOrTypeRef(inputNode.type, parent.schema()!, ctors) as W['inputType'];
  const built = ctors.createFieldArgumentDefinition(inputNode.name.value, parent, type, buildValue(inputNode.defaultValue), inputNode);
  buildAppliedDirectives(inputNode, built, ctors);
  addReferencerToType(built, type);
  return built;
}

function buildInputFieldDefinition<W extends World>(fieldNode: InputValueDefinitionNode, parentType: W['inputObjectType'], ctors: Ctors<W>): W['inputFieldDefinition'] {
  const type = buildWrapperTypeOrTypeRef(fieldNode.type, parentType.schema()!, ctors) as W['inputType'];
  const builtField = ctors.createInputFieldDefinition(fieldNode.name.value, parentType, type, fieldNode);
  buildAppliedDirectives(fieldNode, builtField, ctors);
  addReferencerToType(builtField, type);
  return builtField;
}

function buildDirectiveDefinition<W extends World>(directiveNode: DirectiveDefinitionNode, parent: W['schema'], ctors: Ctors<W>): W['directiveDefinition'] {
  const builtDirective = ctors.createDirectiveDefinition(directiveNode.name.value, parent, directiveNode);
  for (const inputValueDef of directiveNode.arguments ?? []) {
    addDirectiveArg(buildDirectiveArgumentDefinition(inputValueDef, builtDirective, ctors), builtDirective);
  }
  return builtDirective;
}

function buildDirectiveArgumentDefinition<W extends World>(inputNode: InputValueDefinitionNode, parent: W['directiveDefinition'], ctors: Ctors<W>): W['directiveArgumentDefinition'] {
  const type = buildWrapperTypeOrTypeRef(inputNode.type, parent.schema()!, ctors) as W['inputType'];
  const built = ctors.createDirectiveArgumentDefinition(inputNode.name.value, parent, type, buildValue(inputNode.defaultValue), inputNode);
  buildAppliedDirectives(inputNode, built, ctors);
  addReferencerToType(built, type);
  return built;
}

function copy<WS extends World, WD extends World>(source: WS['schema'], destCtors: Ctors<WD>): WD['schema'] {
  const doc = destCtors.addSchemaDefinition(destCtors.schema(), source.schemaDefinition.source());
  for (const type of source.types.values()) {
    addTypeDefinition(copyNamedTypeShallow(type, doc, destCtors), doc);
  }
  copySchemaDefinitionInner(source.schemaDefinition, doc.schemaDefinition, destCtors);
  for (const type of source.types.values()) {
    copyNamedTypeInner(type, doc.type(type.name)!, destCtors);
  }
  for (const directive of source.directives.values()) {
    addDirectiveDefinition(copyDirectiveDefinition(directive, doc, destCtors), doc);
  }
  return doc;
}

function copySchemaDefinitionInner<WS extends World, WD extends World>(source: WS['schemaDefinition'], dest: WD['schemaDefinition'], destCtors: Ctors<WD>) {
  for (const [root, type] of source.roots.entries()) {
    addRoot(root, type.name, dest);
  }
  copyAppliedDirectives(source, dest, destCtors);
}

function copyAppliedDirectives<WS extends World, WD extends World>(source: WS['schemaElement'], dest: WD['schemaElement'], destCtors: Ctors<WD>) {
  for (const directive of source.appliedDirectives()) {
    BaseElement.prototype['addAppliedDirective'].call(dest, copyDirective(directive, dest, destCtors));
  }
}

function copyDirective<WS extends World, WD extends World>(source: WS['directive'], parentDest: WD['schemaElement'], destCtors: Ctors<WD>): WD['directive'] {
  const args = new Map();
  for (const [name, value] of source.arguments.entries()) {
    args.set(name, value);
  }
  return destCtors.createDirective(source.name, parentDest, args, source.source);
}

// Because types can refer to one another (through fields or directive applications), we first create a shallow copy of
// all types, and then copy fields (see below) assuming that the type "shell" exists.
function copyNamedTypeShallow<WS extends World, WD extends World>(source: WS['namedType'], schema: WD['schema'], destCtors: Ctors<WD>): WD['namedType'] {
  return destCtors.createNamedType(source.kind, source.name, schema, source.source());
}

function copyNamedTypeInner<WS extends World, WD extends World>(source: WS['namedType'], dest: WD['namedType'], destCtors: Ctors<WD>) {
  copyAppliedDirectives(source, dest, destCtors);
  switch (source.kind) {
    case 'ObjectType':
      const sourceObjectType = source as WS['objectType'];
      const destObjectType = dest as WD['objectType'];
      for (const field of sourceObjectType.fields.values()) {
        addField(copyFieldDefinition(field, destObjectType, destCtors), destObjectType); 
      }
      break;
    case 'UnionType':
      const sourceUnionType = source as WS['unionType'];
      const destUnionType = dest as WD['unionType'];
      for (const type of sourceUnionType.types) {
        addTypeToUnion(type.name, destUnionType);
      }
      break;
    case 'InputObjectType':
      const sourceInputObjectType = source as WS['inputObjectType'];
      const destInputObjectType = dest as WD['inputObjectType'];
      for (const field of sourceInputObjectType.fields.values()) {
        addField(copyInputFieldDefinition(field, destInputObjectType, destCtors), destInputObjectType);
      }
  }
}

function copyFieldDefinition<WS extends World, WD extends World>(source: WS['fieldDefinition'], destParent: WD['objectType'], destCtors: Ctors<WD>): WD['fieldDefinition'] {
  const type = copyWrapperTypeOrTypeRef(source.type(), destParent.schema()!, destCtors) as WD['outputType'];
  const copiedField = destCtors.createFieldDefinition(source.name, destParent, type, source.source());
  copyAppliedDirectives(source, copiedField, destCtors);
  for (const sourceArg of source.arguments().values()) {
    addFieldArg(copyFieldArgumentDefinition(sourceArg, copiedField, destCtors), copiedField);
  }
  addReferencerToType(copiedField, type);
  return copiedField;
}

function copyInputFieldDefinition<WS extends World, WD extends World>(source: WS['inputFieldDefinition'], destParent: WD['inputObjectType'], destCtors: Ctors<WD>): WD['inputFieldDefinition'] {
  const type = copyWrapperTypeOrTypeRef(source.type(), destParent.schema()!, destCtors) as WD['inputType'];
  const copied = destCtors.createInputFieldDefinition(source.name, destParent, type, source.source());
  copyAppliedDirectives(source, copied, destCtors);
  addReferencerToType(copied, type);
  return copied;
}

function copyWrapperTypeOrTypeRef<WS extends World, WD extends World>(source: WS['type'] | WS['detached'], destParent: WD['schema'], destCtors: Ctors<WD>): WD['type'] | WD['detached'] {
  if (source == undefined) {
    return destCtors.checkDetached(undefined);
  }
  switch (source.kind) {
    case 'ListType':
      return destCtors.createList(copyWrapperTypeOrTypeRef((source as WS['listType']).ofType(), destParent, destCtors) as WD['type']);
    default:
      return destParent.type((source as WS['namedType']).name)!;
  }
}

function copyFieldArgumentDefinition<WS extends World, WD extends World>(source: WS['fieldArgumentDefinition'], destParent: WD['fieldDefinition'], destCtors: Ctors<WD>): WD['fieldArgumentDefinition'] {
  const type = copyWrapperTypeOrTypeRef(source.type(), destParent.schema()!, destCtors) as WD['inputType'];
  const copied = destCtors.createFieldArgumentDefinition(source.name, destParent, type, source.defaultValue(), source.source());
  copyAppliedDirectives(source, copied, destCtors);
  addReferencerToType(copied, type);
  return copied;
}

function copyDirectiveDefinition<WS extends World, WD extends World>(source: WS['directiveDefinition'], destParent: WD['schema'], destCtors: Ctors<WD>): WD['directiveDefinition'] {
  const copiedDirective = destCtors.createDirectiveDefinition(source.name, destParent, source.source());
  for (const sourceArg of source.arguments().values()) {
    addDirectiveArg(copyDirectiveArgumentDefinition(sourceArg, copiedDirective, destCtors), copiedDirective);
  }
  return copiedDirective;
}
function copyDirectiveArgumentDefinition<WS extends World, WD extends World>(source: WS['directiveArgumentDefinition'], destParent: WD['directiveDefinition'], destCtors: Ctors<WD>): WD['directiveArgumentDefinition'] {
  const type = copyWrapperTypeOrTypeRef(source.type(), destParent.schema()!, destCtors) as InputType;
  const copied = destCtors.createDirectiveArgumentDefinition(source.name, destParent, type, source.defaultValue(), source.source());
  copyAppliedDirectives(source, copied, destCtors);
  addReferencerToType(copied, type);
  return copied;
}
