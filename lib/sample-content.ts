// What a visitor actually sees when opening a sample work (/samples/:id).
// Samples are placeholders an operator added (migration 0008); this is the "inside" of each one.

export type Scene = { caption: string; sub?: string; from: string; to: string; shape: 'sun' | 'waves' | 'road' | 'plane' | 'stars' };
export type Panel = { bg: string; lines: { who: string; text: string }[]; note?: string };
export type SampleContent =
  | { kind: 'novel'; chapter: string; paragraphs: string[] }
  | { kind: 'art'; note: string; panels?: Panel[] }
  | { kind: 'video'; scenes: Scene[] };

export const sampleContent: Record<string, SampleContent> = {
  'sample-novel-1': { kind: 'novel', chapter: '1화 · 첫 번째 별', paragraphs: [
    '도서관의 마지막 불이 꺼지면 하늘에서 별이 떨어진다. 사서 윤은 그 사실을 이 도시에서 유일하게 아는 사람이었다.',
    '별은 생각보다 작았다. 손바닥 위에 올려두면 체온보다 조금 따뜻했고, 귀에 가까이 대면 아주 먼 곳의 웃음소리 같은 것이 들렸다.',
    '윤은 별을 주워 서고 맨 끝의 빈 책장에 꽂았다. 다음 날 아침이면 그 자리에는 한 번도 본 적 없는 제목의 책이 한 권 꽂혀 있었다.',
    '오늘 떨어진 별은 유난히 파랬다. 윤이 그것을 집어 들자, 별은 작은 목소리로 말했다. "이번엔 내 이야기를 끝까지 읽어줄 수 있어?"',
    '윤은 대답 대신 책장 앞에 의자를 끌어다 앉았다. 창밖에서 두 번째 별이 떨어지고 있었다.',
  ]},
  'sample-novel-2': { kind: 'novel', chapter: 'commit 1 · fix: 오타 수정', paragraphs: [
    '서하는 월요일 아침마다 같은 저장소의 로그를 먼저 열었다. 일은 핑계였고, 사실은 도윤의 커밋 메시지를 읽기 위해서였다.',
    '"fix: 오타 수정". 바뀐 건 단 한 줄. 버튼 문구의 "확인"이 "확인해 주세요"로 바뀌어 있었다. 서하가 지난주에 지나가듯 했던 말이었다.',
    '그녀는 리뷰 코멘트 창에 "좋아요"라고 썼다가 지우고, "이 문구가 더 다정하네요"라고 다시 썼다.',
    '점심이 지나고 새 커밋이 하나 올라왔다. "feat: 다정한 문구를 전체에 적용". 서하는 모니터 앞에서 혼자 웃음을 참았다.',
    '그날 저녁, 그녀는 처음으로 자기 이름으로 된 커밋을 남겼다. "docs: 다음엔 직접 말해줘도 돼요".',
  ]},
  'sample-novel-3': { kind: 'novel', chapter: '정원 일지 · 412일째', paragraphs: [
    '궤도를 벗어난 지 412일. 정거장의 시계는 여전히 지구 시간을 고집한다. 나는 그 시계에 맞춰 토마토에 물을 준다.',
    '오늘은 세 번째 줄의 상추가 처음으로 꽃을 피웠다. 무중력 상태에서 핀 꽃은 위아래가 없어서, 모든 방향을 향해 동시에 피어난다.',
    '통신 장비는 이틀에 한 번 잡음만 보내온다. 나는 그 잡음을 정원에 틀어둔다. 식물들은 어쩐지 그 소리를 좋아하는 것 같다.',
    '기록 끝에 습관처럼 덧붙인다. 정원 상태 양호. 관리자 상태 양호. 내일도 해가 정거장 창문을 지나갈 것이다.',
  ]},
  'sample-novel-4': { kind: 'novel', chapter: '사건 1 · 사라진 우산', paragraphs: [
    '밤 11시 정각, 사무소의 간판에 불이 들어왔다. 첫 의뢰인은 비에 젖은 정장을 입은 남자였다.',
    '"우산을 잃어버렸습니다." 탐정 한결은 펜을 내려놓았다. "그런 일로 이 시간에 오시는 분은 처음이군요."',
    '"그 우산 손잡이 안에, 제가 십 년 동안 하지 못한 말이 들어 있어서요." 남자는 젖은 영수증 한 장을 테이블 위에 올려놓았다.',
    '영수증에는 오늘 저녁 7시 42분, 역 앞 편의점이 찍혀 있었다. 한결은 코트를 집어 들었다. 새벽 3시까지는 아직 네 시간이 남아 있었다.',
  ]},
  'sample-art-1': { kind: 'art', note: '첫차를 기다리는 정류장의 새벽빛을 분홍과 보라 두 가지 색으로만 표현했어요. 시리즈의 첫 장면으로, 아직 아무도 도착하지 않은 시간이에요.' },
  'sample-art-2': { kind: 'art', note: '24시 편의점의 야간 근무를 그린 짧은 웹툰이에요. 아래로 넘기며 읽어보세요.', panels: [
    { bg: 'linear-gradient(160deg,#ffd166,#f78c6b)', lines: [{ who: '알바생', text: '점장님, 손님 오셨어요.' }], note: '새벽 2시, 편의점' },
    { bg: 'linear-gradient(160deg,#f78c6b,#ef476f)', lines: [{ who: '점장 고양이', text: '…냐.' }, { who: '알바생', text: '그 손님도 고양이네요.' }] },
    { bg: 'linear-gradient(160deg,#ef476f,#8338ec)', lines: [{ who: '손님 고양이', text: '츄르 두 개 주세요.' }, { who: '점장 고양이', text: '…냐아.' }], note: '결제는 꾹꾹이로' },
    { bg: 'linear-gradient(160deg,#8338ec,#3a0ca3)', lines: [{ who: '알바생', text: '오늘도 매출은 츄르가 1등이네요.' }], note: '다음 화에 계속' },
  ]},
  'sample-art-3': { kind: 'art', note: '16색 팔레트만 사용한 픽셀 아트예요. 한 칸 한 칸 찍어서 바닷가 항구 마을의 저녁을 표현했어요.' },
  'sample-art-4': { kind: 'art', note: '버려진 온실을 돌보는 로봇의 컨셉 아트예요. 둥근 형태와 초록빛으로 다시 살아나는 온실의 분위기를 잡았어요.' },
  'sample-video-1': { kind: 'video', scenes: [
    { caption: '장마가 끝난 첫날', sub: '오전 7:10', from: '#f9c74f', to: '#f3722c', shape: 'sun' },
    { caption: '창문을 열면 매미 소리', from: '#f8961e', to: '#f94144', shape: 'sun' },
    { caption: '골목 끝 아이스크림 가게', from: '#90be6d', to: '#43aa8b', shape: 'road' },
    { caption: '소나기가 지나간 오후', from: '#4d908e', to: '#277da1', shape: 'waves' },
    { caption: '해 질 녘 강가', from: '#f3722c', to: '#577590', shape: 'waves' },
    { caption: '그리고, 여름 밤', sub: '30초의 여름 · 끝', from: '#277da1', to: '#1d3557', shape: 'stars' },
  ]},
  'sample-video-2': { kind: 'video', scenes: [
    { caption: '교실 창문 밖으로', from: '#90e0ef', to: '#0077b6', shape: 'plane' },
    { caption: '운동장을 지나', from: '#48cae4', to: '#0096c7', shape: 'plane' },
    { caption: '시장 지붕 위로', from: '#ade8f4', to: '#023e8a', shape: 'plane' },
    { caption: '강을 건너', from: '#00b4d8', to: '#03045e', shape: 'waves' },
    { caption: '누군가의 손에 닿았다', sub: '종이 비행기 · 끝', from: '#caf0f8', to: '#0077b6', shape: 'plane' },
  ]},
  'sample-video-3': { kind: 'video', scenes: [
    { caption: 'NEON DRIVE', sub: 'synthwave', from: '#f72585', to: '#3a0ca3', shape: 'road' },
    { caption: '밤 12시, 도로 위', from: '#b5179e', to: '#3f37c9', shape: 'road' },
    { caption: '비트에 맞춰 바뀌는 불빛', from: '#7209b7', to: '#4361ee', shape: 'road' },
    { caption: '끝없이 이어지는 지평선', from: '#560bad', to: '#4cc9f0', shape: 'sun' },
    { caption: 'DRIVE SAFE', sub: 'Neon Drive · 끝', from: '#480ca8', to: '#f72585', shape: 'stars' },
  ]},
  'sample-video-4': { kind: 'video', scenes: [
    { caption: '프롬프트 1: 새벽의 바다', from: '#48cae4', to: '#03045e', shape: 'waves' },
    { caption: '프롬프트 4: 물결 위의 빛', from: '#90e0ef', to: '#0077b6', shape: 'waves' },
    { caption: '프롬프트 7: 폭풍 전의 고요', from: '#6c757d', to: '#212529', shape: 'waves' },
    { caption: '프롬프트 10: 다시 맑아진 하늘', from: '#ade8f4', to: '#0096c7', shape: 'sun' },
    { caption: '프롬프트 12: 해가 지는 바다', sub: 'AI로 그린 바다 · 끝', from: '#f8961e', to: '#03045e', shape: 'waves' },
  ]},
};
