import sys, pandas as pd
def load(d, g):
    df = pd.read_csv(f'{d}.{g}.csv')
    names = [c for c in df.columns if c.endswith('_NAME') and not c.startswith(('DATE','GEOGRAPHY'))]
    df = df.groupby(names, sort=False)['OBS_VALUE'].sum().reset_index()
    df.columns = [c.replace('C2021_','').replace('_NAME','') for c in df.columns]
    return df
if __name__=='__main__':
    d=sys.argv[1]
    for g in ['EW','IL']:
        df=load(d,g); print(g, len(df)); print(df.to_string(max_rows=int(sys.argv[2]) if len(sys.argv)>2 else 60))
