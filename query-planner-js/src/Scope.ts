import { DirectiveNode, GraphQLCompositeType, GraphQLObjectType, ValueNode } from "graphql";

export class Scope<TParent extends GraphQLCompositeType> {
  private cachedIdentityKey: string | undefined = undefined;
  public readonly possibleTypes: ReadonlyArray<GraphQLObjectType>;

  constructor(
    public readonly parentType: TParent,
    possibleTypes: ReadonlyArray<GraphQLObjectType>,
    public readonly directives?: ReadonlyArray<DirectiveNode>) {
    // We need to sort the possible types to make our `identityKey()` method work.
    this.possibleTypes = [...possibleTypes].sort();
  }

  private valueIdentityKey(value: ValueNode) : string {
    switch (value.kind) {
      case 'Variable':
        return value.name.value;
      case 'IntValue':
      case 'FloatValue':
      case 'StringValue':
      case 'EnumValue':
        return value.value;
      case 'BooleanValue':
        return String(value.value);
      case 'NullValue':
        return "<null>";
      case 'ListValue':
        return value.values.map(this.valueIdentityKey).join('-');
      case 'ObjectValue':
        return value.fields.map(f => f.name.value + '-' + this.valueIdentityKey(f.value)).join('-');
    }
  }

  private directiveIdentityKey(directive: DirectiveNode) : string {
    const argumentsKey = directive.arguments
      ? directive.arguments.map(arg => arg.name.value + '-' + this.valueIdentityKey(arg.value)).join('-')
      : "";
    return `${directive.name.value}-${argumentsKey}`;
  }

  /**
   * A string value that uniquely identify the scope.
   *
   * The "identity key" of 2 scope objects can be tested for equality to decide if 2 scopes are equal. This exists
   * so that scopes can be (kind of) used as map keys: javacript maps always only use reference equality for objects
   * when used as key, so using this string allows to effectively get value equality.
   *
   * @returns a string uniquely identifying this scope.
   */
  public identityKey() : string {
    if (!this.cachedIdentityKey) {
      const directivesKey = this.directives ? this.directives.map(this.directiveIdentityKey).join('-') : "";
      this.cachedIdentityKey =  `${this.parentType}-${this.possibleTypes.join('-')}-${directivesKey}`;
    }
    return this.cachedIdentityKey;
  }

  /**
   * Provides a string representation of this scope suitable for debugging.
   *
   * The format looks like '<A [A1, A2] {@x, @y}>' where 'A' is the scope 'parentType', '[A1, A2]' are the
   * 'possibleTypes' and '{@x, @y}' the potential directives.
   *
   * @return a string representation of the scope.
   */
  public debugPrint() : string {
    let directiveStr = '';
    if (this.directives) {
      directiveStr = ' {' + this.directives.map(d => '@' + d.name.value).join(', ') + '}';
    }
    return`<${this.parentType} [${this.possibleTypes}]${directiveStr}>`;
  }
}
