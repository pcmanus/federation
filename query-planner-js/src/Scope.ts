import { DirectiveNode, GraphQLCompositeType, GraphQLObjectType, isTypeSubTypeOf, print, stripIgnoredCharacters } from "graphql";
import { ValueObject } from "immutable";
import { QueryPlanningContext } from "./QueryPlanningContext";

export class Scope implements ValueObject {
  private cachedRuntimeTypes?: ReadonlyArray<GraphQLObjectType>;

  private constructor(
    private readonly context: QueryPlanningContext,
    public readonly parentType: GraphQLCompositeType,
    public readonly directives?: ReadonlyArray<DirectiveNode>,
    public readonly enclosing?: Scope
  ) {
  }

  static create(context: QueryPlanningContext, parentType: GraphQLCompositeType) {
    return new Scope(context, parentType, undefined, undefined);
  }

  refine(type: GraphQLCompositeType, directives?: ReadonlyArray<DirectiveNode>) : Scope {
    // Always treat the absence of directives as "undefined" to make is simpler.
    if (directives && directives.length == 0) {
      directives = undefined;
    }
    // If we have directives, we always want to preserve the condition so as to preserve that directive.
    if (directives) {
      return new Scope(this.context, type, directives, this);
    }
    if (!this.isStrictlyRefinedBy(type)) {
      return this;
    }
    return new Scope(this.context, type, directives, Scope.pruneRefinedTypes(this, type));
  }

  private static pruneRefinedTypes(
    toPrune: Scope | undefined,
    refiningType: GraphQLCompositeType
  ) : Scope | undefined {
    if (!toPrune) {
      return undefined;
    }
    if (!toPrune.directives && isTypeSubTypeOf(toPrune.context.schema, refiningType, toPrune.parentType)) {
      // The newly added type is a subtype of the current "link", and the current link has no directives,
      // so it's not useful anymore. Skip it, and check if we can prune further.
      return Scope.pruneRefinedTypes(toPrune.enclosing, refiningType);
    }
    return new Scope(
      toPrune.context,
      toPrune.parentType,
      toPrune.directives,
      Scope.pruneRefinedTypes(toPrune.enclosing, refiningType)
    );
  }

  /**
   * Whether refining this scope by the provided type would strictly reduce the possible runtime types
   * of the scope.
   */
  isStrictlyRefinedBy(type: GraphQLCompositeType) : boolean {
    // If one of the type in the chain is a subtype of the provided type, then the type will not strictly
    // refine the scope.
    let scope: Scope | undefined = this;
    while (scope) {
      if (isTypeSubTypeOf(this.context.schema, scope.parentType, type)) {
        return false;
      }
      scope = scope.enclosing;
    }
    return true;
  }

  /**
   *  Whether this scope is restricting the possible runtime types of the provided type.
   */
  isStrictlyRefining(type: GraphQLCompositeType) : boolean {
    // This scope will refine the provided type, unless that provided type is a subtype of all
    // the type in the chain.
    let scope: Scope | undefined = this;
    while (scope) {
      if (scope.parentType !== type && isTypeSubTypeOf(this.context.schema, scope.parentType, type)) {
        return true;
      }
      scope = scope.enclosing;
    }
    return false;
  }

  private computePossibleRuntimeTypes() : ReadonlyArray<GraphQLObjectType> {
    // The possible runtime types is the intersection of all the possible types of each condition in scope.
    let possibleTypes = this.context.getPossibleTypes(this.parentType);
    let nextScope = this.enclosing;
    while (nextScope) {
      let enclosingPossibleTypes = this.context.getPossibleTypes(nextScope.parentType);
      possibleTypes = possibleTypes.filter(t => enclosingPossibleTypes.includes(t));
      nextScope = nextScope.enclosing;
    }
    return possibleTypes;
  }

  possibleRuntimeTypes() : ReadonlyArray<GraphQLObjectType> {
    if (!this.cachedRuntimeTypes) {
      this.cachedRuntimeTypes = this.computePossibleRuntimeTypes();
    }
    return this.cachedRuntimeTypes;
  }

  private static directiveToString(d: DirectiveNode): string {
    return stripIgnoredCharacters(print(d));
  }

  private static directivesEquals(d1?: ReadonlyArray<DirectiveNode>, d2?: ReadonlyArray<DirectiveNode>) : boolean {
    if (!d1) return !d2;
    if (!d2) return false;
    if (d1.length !== d2.length) return false;
    // TODO: for now, we "print" each directives and check string equality as a shortcut.
    // We should instead write a proper equality method that compares each directives names and arguments.
    // Note in particular that the current method would consider '@f(a: 1, b: 2)' !=== '@f(b: 2, a: 1)', which
    // is kind of wrong since argument order should not matter. This doesn't have an
    // important impact as of this writing but ...
    let d1Strings = d1.map(d => Scope.directiveToString(d));
    let d2Strings = d2.map(d => Scope.directiveToString(d));
    d1Strings.sort(); d2Strings.sort();
    for (let i = 0; i < d1.length; i++) {
      if (d1Strings[i] !== d2Strings[i]) {
        return false;
      }
    }
    return true;
  }

  equals(other: any): boolean {
    if (!(other instanceof Scope)) {
      return false;
    }

    let thisScope: Scope | undefined = this;
    let thatScope: Scope | undefined = other;
    while (thisScope && thatScope) {
      if (thisScope.parentType !== thatScope.parentType
          || !Scope.directivesEquals(thisScope.directives, thatScope.directives)) {
        return false;
      }
      thisScope = thisScope.enclosing;
      thatScope = thatScope.enclosing;
    }
    return !thisScope && !thatScope;
  }

  private static stringHash(s: string): number {
    let h = 31;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    return h;
  }

  hashCode(): number {
    let hash = Scope.stringHash(this.parentType.name);
    if (this.directives) {
      hash += this.directives.map(d => Scope.stringHash(Scope.directiveToString(d))).reduce((prev, curr) => Math.imul(31, prev) + curr | 0, 31);
    }
    return hash | 0; // Ensure an Uint32 (see https://immutable-js.github.io/immutable-js/docs/#/ValueObject/hashCode).
  }

  /**
   * Provides a string representation of this scope suitable for debugging.
   *
   * The format looks like '<A @x @y <B> >' where 'A' is the scope 'parentType', '<B>' is the 'enclosing' scope
   * and '@x @y' the potential directives.
   *
   * @return a string representation of the scope.
   */
  debugPrint() : string {
    let enclosingStr = '';
    if (this.enclosing) {
      enclosingStr = ' ' + this.enclosing.debugPrint();
    }
    let directiveStr = '';
    if (this.directives) {
      directiveStr = this.directives.map(d => ' @' + d.name.value).join(' ');
    }
    return`<${this.parentType}${directiveStr}${enclosingStr}>`;
  }
}
