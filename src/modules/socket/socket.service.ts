import config from '@configs/configuration';
import { Insurance } from '@modules/insurance/schemas/insurance.schema';
import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { omit } from 'lodash';

@Injectable()
export class SocketService {
  private readonly INSURANCE_SOCKET_URL = config.INSURANCE_OFFCHAIN_ENDPOINT;
  private readonly INSURANCE_SOCKET_PATH = '/api/insurance/v1/socket'; // emit event cho user nami insurance
  private readonly EXCHANGE_SOCKET_PATH = '/api/insurance/v1/redis'; // emit event cho user nami exchange

  private readonly mainSocket: AxiosInstance;

  constructor() {
    this.mainSocket = axios.create({
      baseURL: this.INSURANCE_SOCKET_URL,
      headers: {
        'service-private-key': config.INSURANCE_SECRET_KEY,
        secretkey: config.INSURANCE_SECRET_KEY,
      },
      // validateStatus: () => true,
    });
  }

  /**
   * Emits a socket event to a specific user.
   * @param userId The ID of the user to emit the event to.
   * @param event The name of the event to emit.
   * @param payload Optional data to send along with the event.
   */
  async emitToUser({
    userId,
    event,
    payload,
  }: {
    userId: number;
    event: string;
    payload?: any;
  }) {
    try {
      await this.mainSocket.post(this.INSURANCE_SOCKET_PATH, {
        userId,
        event,
        payload,
      });
      return true;
    } catch (error) {
      console.error('EMIT TO USER ERROR: ', { event, payload, error });
      return false;
    }
  }

  async emitUpdateInsuranceToUser(payload: Partial<Insurance>) {
    try {
      await this.mainSocket.post(`${this.INSURANCE_SOCKET_PATH}/change-state`, {
        insurance: omit(payload, ['binance']),
      });
      return true;
    } catch (error) {
      console.error('NOTI CHANGE STATE ERROR: ', { payload, error });
      return false;
    }
  }

  async emitUpdateInsuranceToExchange(payload: {
    namiUserId: string | number;
    symbol: string;
    futuresOrderId: string;
  }) {
    try {
      await this.mainSocket.post(
        `${this.EXCHANGE_SOCKET_PATH}/emit-insurance-to-nami`,
        payload,
      );
      return true;
    } catch (error) {
      console.error('EMIT INSURANCE TO EXCHANGE ERROR', { payload, error });
      return false;
    }
  }
}
