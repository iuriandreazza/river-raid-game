import {
  DEFAULT_PAGE_SIZE,
  type ApiErrorResponse,
  type CreateSessionResponse,
  type LeaderboardEntry,
  type SubmitScoreRequest,
  type SubmitScoreResponse,
  type TopScoresResponse,
} from '../../../shared/leaderboard-contract.ts';
import { LeaderboardError, type LeaderboardPort, type SubmitScoreInput } from '../../application/ports.ts';

type Fetch = typeof fetch;

export class HttpLeaderboard implements LeaderboardPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: Fetch;

  constructor(baseUrl = '/api', fetchImpl: Fetch = globalThis.fetch.bind(globalThis)) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async startSession(): Promise<string> {
    const { sessionId } = await this.request<CreateSessionResponse>('/sessions', { method: 'POST' });
    return sessionId;
  }

  async submitScore(input: SubmitScoreInput): Promise<LeaderboardEntry> {
    const body: SubmitScoreRequest = input;
    const { entry } = await this.request<SubmitScoreResponse>('/scores', { method: 'POST', body });
    return entry;
  }

  async topScores(limit = DEFAULT_PAGE_SIZE): Promise<LeaderboardEntry[]> {
    const { entries } = await this.request<TopScoresResponse>(`/scores?limit=${limit}`);
    return entries;
  }

  private async request<T>(path: string, options: { method?: 'POST'; body?: unknown } = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new LeaderboardError('network', 'The leaderboard cannot be reached.');
    }

    if (!response.ok) throw await toLeaderboardError(response);
    return (await response.json()) as T;
  }
}

async function toLeaderboardError(response: Response): Promise<LeaderboardError> {
  try {
    const { error } = (await response.json()) as ApiErrorResponse;
    return new LeaderboardError(error.code, error.message);
  } catch {
    return new LeaderboardError('unexpected', `The leaderboard answered with HTTP ${response.status}.`);
  }
}
