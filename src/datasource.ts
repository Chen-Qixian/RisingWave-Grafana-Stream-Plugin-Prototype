import defaults from 'lodash/defaults';
import { Observable, merge } from 'rxjs';
import { getBackendSrv } from '@grafana/runtime';

import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
  CircularDataFrame,
  LoadingState,
  // FrameMatcherID,
} from '@grafana/data';

import { MyQuery, MyDataSourceOptions, defaultQuery } from './types';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  resolution: number;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);

    this.resolution = instanceSettings.jsonData.resolution || 1000.0;
  }

  async doRequest(query: MyQuery) {
    const result = await getBackendSrv().datasourceRequest({
      method: 'GET',
      url: 'https://api.example.com/metrics',
      params: query,
    });

    return result;
  }

  queryStreaming(options: DataQueryRequest<MyQuery>): Observable<DataQueryResponse> {
    const streams = options.targets.map((target) => {
      const query = defaults(target, defaultQuery);

      return new Observable<DataQueryResponse>((subscriber) => {
        const frame = new CircularDataFrame({
          append: 'tail',
          capacity: 1000,
        });

        frame.refId = query.refId;
        frame.addField({ name: 'time', type: FieldType.time });
        frame.addField({ name: 'value', type: FieldType.number });

        const intervalId = setInterval(() => {
          frame.add({ time: Date.now(), value: Math.random() });

          subscriber.next({
            data: [frame],
            key: query.refId,
            state: LoadingState.Streaming,
          });
        }, 100);

        return () => {
          clearInterval(intervalId);
        };
      });
    });

    return merge(...streams);
  }

  async queryAPI(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const promises = options.targets.map((query) =>
      this.doRequest(query).then((response) => {
        const frame = new MutableDataFrame({
          refId: query.refId,
          fields: [
            { name: 'Time', type: FieldType.time },
            { name: 'Value', type: FieldType.number },
          ],
        });

        response.data.forEach((point: any) => {
          frame.appendRow([point.time, point.value]);
        });

        return frame;
      })
    );

    return Promise.all(promises).then((data) => ({ data }));
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from.valueOf();
    const to = range!.to.valueOf();

    // Generating sine wave
    const data = options.targets.map((target) => {
      const query = defaults(target, defaultQuery);
      const frame = new MutableDataFrame({
        refId: query.refId,
        fields: [
          { name: 'time', type: FieldType.time },
          { name: 'value', type: FieldType.number },
        ],
      });
      const duration = to - from;
      const step = duration / this.resolution;
      for (let t = 0; t < duration; t += step) {
        frame.add({ time: from + t, value: Math.sin((2 * Math.PI * query.frequency * t) / duration) });
      }
      return frame;
    });

    return { data };
  }

  async testDatasource() {
    // Implement a health check for your data source.
    return {
      status: 'success',
      message: 'Success',
    };
  }
}
