import {
  assert,
  baseType,
  CompositeType,
  federationMetadata,
  FieldDefinition,
  collectTargetFields,
  InterfaceType,
  ObjectType,
  Schema,
  DirectiveDefinition
} from ".";

export const computeShareables = (schema: Schema) => {
  const metadata = federationMetadata(schema);
  return computeAllFieldsWithDirective(schema, metadata?.isFed2Schema() ? metadata.shareableDirective() : undefined, true);
};

export const computeKeys = (schema: Schema) => {
  const metadata = federationMetadata(schema);
  return computeAllFieldsWithDirective(schema, metadata?.isFed2Schema() ? metadata.keyDirective() : undefined, false);
};

function computeAllFieldsWithDirective(schema: Schema, directive: DirectiveDefinition<any> | undefined, includeOtherFieldsOnType: boolean): (field: FieldDefinition<CompositeType>) => boolean {
  const metadata = federationMetadata(schema);
  assert(metadata, 'Schema should be a federation subgraph');

  const keyDirective = metadata.keyDirective();
  const providesDirective = metadata.providesDirective();
  // @shareable is only available on fed2 schema, but the schema upgrader call this on fed1 schema as a shortcut to
  // identify key fields (because if we know nothing is marked @shareable, then the only fields that are shareable
  // by default are key fields).

  const fields: Set<string> = new Set();
  const addKeyFields = (type: CompositeType) => {
    for (const key of type.appliedDirectivesOf(keyDirective)) {
      collectTargetFields({
        parentType: type,
        directive: key,
        includeInterfaceFieldsImplementations: true,
        validate: false,
      }).forEach((f) => fields.add(f.coordinate));
    }
  };

    for (const type of schema.types<ObjectType>('ObjectType')) {
      addKeyFields(type);
      const directivesOnType = directive ? type.appliedDirectivesOf(directive) : [];
      for (const field of type.fields()) {
        const fieldIsShareable = directive && field.hasAppliedDirective(directive)
          || (directivesOnType.length > 0 && directivesOnType.some((d) => field.ofExtension() === d.ofExtension()));
        if (fieldIsShareable) {
          if (includeOtherFieldsOnType) {
            fields.add(field.coordinate);
          }
        }
        for (const provides of field.appliedDirectivesOf(providesDirective)) {
          collectTargetFields({
            parentType: baseType(field.type!) as CompositeType,
            directive: provides,
            includeInterfaceFieldsImplementations: true,
            validate: false,
          }).forEach((f) => {
            // Fed2 schema reject provides on non-external field, but fed1 doesn't (at least not always), and we actually
            // call this on fed1 schema upgrader. So let's make sure we do ignore non-external fields.
            if (metadata.isFieldExternal(f)) {
              fields.add(f.coordinate);
            }
          });
        }
      }
    }
  for (const type of schema.types<InterfaceType>('InterfaceType')) {
    addKeyFields(type);
  }
  return (field) => fields.has(field.coordinate);
}

