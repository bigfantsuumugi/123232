import axios from 'axios'

export class MessagingClient {
  private apiUrl: string

  constructor(
    public baseUrl: string,
    private password: string,
    private clientId?: string,
    private clientToken?: string
  ) {
    this.apiUrl = `${this.baseUrl}/api`
  }

  async syncClient(config: any) {
    const res = await axios.post(`${this.apiUrl}/sync`, config, { headers: { password: this.password } })
    return res.data
  }

  async sendMessage(conversationId: string, channel: string, payload: any) {
    await axios.post(
      `${this.apiUrl}/chat/reply`,
      {
        conversationId,
        channel,
        payload
      },
      { headers: { password: this.password }, auth: { username: this.clientId!, password: this.clientToken! } }
    )
  }
}
