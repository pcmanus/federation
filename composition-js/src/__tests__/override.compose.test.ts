import { printSchema } from "@apollo/federation-internals";
import gql from "graphql-tag";
import "./matchers";
import {
  assertCompositionSuccess,
  schemas,
  errors,
  composeAsFed2Subgraphs,
} from "./compose.test";

describe("composition involving @override directive", () => {
  it("@override whole type", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") @override(from: "Subgraph2") {
          k: ID
          a: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.2\\")
        @core(feature: \\"https://specs.apollo.dev/join/v0.2\\", for: EXECUTION)
      {
        query: Query
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      enum core__Purpose {
        \\"\\"\\"
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        \\"\\"\\"
        SECURITY

        \\"\\"\\"
        \`EXECUTION\` features provide metadata necessary for operation execution.
        \\"\\"\\"
        EXECUTION
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPH1 @join__graph(name: \\"Subgraph1\\", url: \\"https://Subgraph1\\")
        SUBGRAPH2 @join__graph(name: \\"Subgraph2\\", url: \\"https://Subgraph2\\")
      }

      type Query
        @join__type(graph: SUBGRAPH1)
        @join__type(graph: SUBGRAPH2)
      {
        t: T @join__field(graph: SUBGRAPH1)
      }

      type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID @join__field(graph: SUBGRAPH1)
        a: Int @join__field(graph: SUBGRAPH1)
      }"
    `);
  });

  it("@override but not yet overriden", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph2")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.2\\")
        @core(feature: \\"https://specs.apollo.dev/join/v0.2\\", for: EXECUTION)
      {
        query: Query
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      enum core__Purpose {
        \\"\\"\\"
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        \\"\\"\\"
        SECURITY

        \\"\\"\\"
        \`EXECUTION\` features provide metadata necessary for operation execution.
        \\"\\"\\"
        EXECUTION
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPH1 @join__graph(name: \\"Subgraph1\\", url: \\"https://Subgraph1\\")
        SUBGRAPH2 @join__graph(name: \\"Subgraph2\\", url: \\"https://Subgraph2\\")
      }

      type Query
        @join__type(graph: SUBGRAPH1)
        @join__type(graph: SUBGRAPH2)
      {
        t: T @join__field(graph: SUBGRAPH1)
      }

      type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID
        a: Int @join__field(graph: SUBGRAPH1)
      }"
    `);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Query {
        t: T
      }

      type T {
        k: ID
        a: Int
      }
    `);
  });

  it("override from self error", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph1")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors?.length).toBe(1);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      [
        "OVERRIDE_FROM_SELF_ERROR",
        `Source and destination subgraphs 'Subgraph1' the same for overridden field 'T.a'`,
      ],
    ]);
  });

  it("multiple override error", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph2")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph1")
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors?.length).toBe(2);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      [
        "OVERRIDE_SOURCE_HAS_OVERRIDE",
        `Field 'T.a' on subgraph 'Subgraph1' has been previously marked with directive @override in subgraph 'Subgraph2'`,
      ],
      [
        "OVERRIDE_SOURCE_HAS_OVERRIDE",
        `Field 'T.a' on subgraph 'Subgraph2' has been previously marked with directive @override in subgraph 'Subgraph1'`,
      ],
    ]);
  });
});
