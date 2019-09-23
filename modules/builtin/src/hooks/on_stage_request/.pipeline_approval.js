'use strict'

/**
 * Gives a short demonstration of a pipeline approval process.
 *
 * @param bp The botpress SDK
 * @param bot The complete configuration of the bot
 * @param users The list of users of that workspace (email, role)
 * @param pipeline The list of configured stages
 * @param hookResult The result of the hook which contains actions
 */
const stageChangeRequest = async () => {
  const request_user = users.find(u => u.email == bot.pipeline_status.stage_request.requested_by)

  // By default, we want to keep the bot in the current stage
  hookResult.actions = []

  const stageRequest = bot.pipeline_status.stage_request
  stageRequest.approvers = stageRequest.approvers || _getApprovers()
  const approvers = stageRequest.approvers

  const requestUserEmail = request_user.email
  // If the current user is an approver, mark his approval
  if (approvers.map(x => x.email).includes(requestUserEmail)) {
    approvers.find(x => x.email === requestUserEmail).approved = true
  }

  // The status will be displayed in the bots list in the Workspace
  stageRequest.status = `Approvals: ${approvers.filter(x => x.approved === true).length}/${approvers.length}`

  // Save the bot
  await bp.config.mergeBotConfig(bot.id, { pipeline_status: bot.pipeline_status })

  // If all approvers have approved, move the bot to the next stage
  if (approvers.filter(x => x.approved === false).length === 0) {
    const currentStage = pipeline.find(x => x.id === bot.pipeline_status.current_stage.id)
    hookResult.actions = [currentStage.action]
  }
}

const _getApprovers = () => {
  // Either hardcode approvers like this, or call your own service to retrieve approvers
  return [
    {
      email: 'alice@acme.com',
      approved: false
    },
    {
      email: 'bob@acme.com',
      approved: false
    },
    {
      email: 'security@acme.com',
      approved: false
    }
  ]
}

return stageChangeRequest()
