// tree_parse.h
#ifndef TREE_PARSE_H
#define TREE_PARSE_H

#include <vector>
#include <string>
#include <cstdint>


struct Sample {
  uint64_t timestamp;
  uint64_t value;
};

struct TreeNode {
  std::string name;
  uint64_t value;
  uint64_t left_sum;
  bool cold;
  std::vector<Sample> samples;
  std::vector<TreeNode> children;
};

TreeNode prune_tree(const TreeNode &node, uint64_t threshold_left,
                    uint64_t threshold_right, const std::string counter_name);

#endif // TREE_PARSE_H
