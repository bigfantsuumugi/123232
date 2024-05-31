import { InterfaceDeclaration } from './integration/definition'
import z from './zui'

const nextToken = z.string().optional()
export const listable = new InterfaceDeclaration({
  name: 'listable',
  entities: {
    item: {
      schema: z.object({ id: z.string() }),
    },
  },
  events: {},
  actions: {
    list: {
      input: {
        schema: () => z.object({ nextToken }),
      },
      output: {
        schema: (args) => z.object({ items: z.array(args.item), meta: z.object({ nextToken }) }),
      },
    },
  },
})

export const creatable = new InterfaceDeclaration({
  name: 'creatable',
  entities: {
    item: {
      schema: z.object({ id: z.string() }),
    },
    input: {
      schema: z.object({}),
    },
  },
  events: {
    created: {
      schema: (args) => args.item,
    },
  },
  actions: {
    create: {
      input: {
        schema: (args) => args.input,
      },
      output: {
        schema: (args) => z.object({ item: args.item }),
      },
    },
  },
})

export const hitl = new InterfaceDeclaration({
  name: 'hitl',
  entities: {},
  events: {},
  actions: {
    startHITL: {
      input: {
        schema: () => z.object({ upstreamConversationId: z.string() }),
      },
      output: {
        schema: () => z.object({ downstreamConversationId: z.string() }),
      },
    },
  },
})
