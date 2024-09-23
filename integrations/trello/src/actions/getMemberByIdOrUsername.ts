import { getMemberByIdOrUsernameInputSchema } from 'src/schemas/actions'
import { wrapActionAndInjectServices } from 'src/utils'

export const getMemberByIdOrUsername = wrapActionAndInjectServices<'getMemberByIdOrUsername'>({
  async action({ input }, { memberQueryService }) {
    const { memberIdOrUsername } = getMemberByIdOrUsernameInputSchema.parse(input)

    const member = await memberQueryService.getMemberByIdOrUsername(memberIdOrUsername)
    return { member }
  },
  errorMessage: 'Failed to retrieve the member',
})
